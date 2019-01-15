/*
Copyright (c) 2019, because-why-not.com Limited
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
import {ConnectionId, NetworkEvent, NetEventType, IBasicNetwork} from './INetwork'
import { SLog } from './Helper';

export enum WebsocketConnectionStatus {
    Uninitialized,
    NotConnected,
    Connecting,
    Connected,
    Disconnecting //server will shut down, all clients disconnect, ...
}

export enum WebsocketServerStatus {
    Offline,
    Starting,
    Online,
    ShuttingDown
}

//TODO: handle errors if the socket connection failed
//+ send back failed events for connected / serverstart events that are buffered
export class WebsocketNetwork implements IBasicNetwork  {

    //websocket. 
    private mSocket: WebSocket;

    //currents status. will be updated based on update call
    private mStatus = WebsocketConnectionStatus.Uninitialized;
    public getStatus() { return this.mStatus;};

    //queue to hold buffered outgoing messages
    private mOutgoingQueue = new Array<NetworkEvent>();

    //buffer for incoming messages
    private mIncomingQueue = new Array<NetworkEvent>();

    //Status of the server for incoming connections
    private mServerStatus = WebsocketServerStatus.Offline;

    //outgoing connections (just need to be stored to allow to send out a failed message
    //if the whole signaling connection fails
    private mConnecting = new Array<number>();
    private mConnections = new Array<number>();

    //next free connection id
    private mNextOutgoingConnectionId = new ConnectionId(1);

    private mUrl: string = null;
    private mIsDisposed = false;


    public constructor(url: string) {
        this.mUrl = url;
        this.mStatus = WebsocketConnectionStatus.NotConnected;
    }
    private WebsocketConnect(): void {

        this.mStatus = WebsocketConnectionStatus.Connecting;
        this.mSocket = new WebSocket(this.mUrl);
        this.mSocket.binaryType = "arraybuffer"; 
        this.mSocket.onopen = () => { this.OnWebsocketOnOpen(); }
        this.mSocket.onerror = (error) => { this.OnWebsocketOnError(error); };
        this.mSocket.onmessage = (e) => { this.OnWebsocketOnMessage(e); };
        this.mSocket.onclose = (e) => { this.OnWebsocketOnClose(e); };
        //js websockets connect automatically after creation?
    }
    private WebsocketCleanup() : void {
        this.mSocket.onopen = null;
        this.mSocket.onerror = null;
        this.mSocket.onmessage = null;
        this.mSocket.onclose = null;
        if (this.mSocket.readyState == this.mSocket.OPEN
            || this.mSocket.readyState == this.mSocket.CONNECTING) {

            this.mSocket.close();
        }
        this.mSocket = null;
    }
    private EnsureServerConnection(): void
    {
        if (this.mStatus == WebsocketConnectionStatus.NotConnected) {
                //no server
                //no connection about to be established
                //no current connections
                //-> disconnect the server connection
            this.WebsocketConnect();
        }
    }

    private CheckSleep() : void
    {
        if (this.mStatus == WebsocketConnectionStatus.Connected
            && this.mServerStatus == WebsocketServerStatus.Offline
            && this.mConnecting.length == 0
            && this.mConnections.length == 0) {
            //no server
            //no connection about to be established
            //no current connections
            //-> disconnect the server connection
            this.Cleanup();
        }
    }

    private OnWebsocketOnOpen() {

        SLog.L('onWebsocketOnOpen');
        this.mStatus = WebsocketConnectionStatus.Connected;
    }
    private OnWebsocketOnClose(event: CloseEvent) {
        SLog.L('Closed: ' + JSON.stringify(event));

        if(event.code != 1000)
        {
            SLog.LE("Websocket closed with code: " + event.code + " " + event.reason);
        }

        //ignore closed event if it was caused due to a shutdown (as that means we cleaned up already)
        if (this.mStatus == WebsocketConnectionStatus.Disconnecting
            || this.mStatus == WebsocketConnectionStatus.NotConnected)
            return;
        this.Cleanup();
        this.mStatus = WebsocketConnectionStatus.NotConnected;
    }
    private OnWebsocketOnMessage(event) {
        if (this.mStatus == WebsocketConnectionStatus.Disconnecting
            || this.mStatus == WebsocketConnectionStatus.NotConnected)
            return;
        //browsers will have ArrayBuffer in event.data -> change to byte array
        let evt = NetworkEvent.fromByteArray(new Uint8Array(event.data));
        this.HandleIncomingEvent(evt);
    }

    private OnWebsocketOnError(error) {
        //the error event doesn't seem to have any useful information?
        //browser is expected to call OnClose after this
        SLog.LE('WebSocket Error ' + error);
    }
    /// <summary>
    /// called during Disconnecting state either trough server connection failed or due to Shutdown
    /// 
    /// Also used to switch to sleeping mode. In this case there connection isn't used as
    /// server and doesn't have any connections (established or connecting) thus
    /// only WebsocketCleanup is in effect.
    /// 
    /// WebsocketNetwork has to be still usable after this call like a newly
    /// created connections (except with events in the message queue)
    /// </summary>
    private Cleanup(): void {

        //check if this was done already (or we are in the process of cleanup already)
        if (this.mStatus == WebsocketConnectionStatus.Disconnecting
            || this.mStatus == WebsocketConnectionStatus.NotConnected)
            return;

        this.mStatus = WebsocketConnectionStatus.Disconnecting;

        //throw connection failed events for each connection in mConnecting
        for (let conId of this.mConnecting) {
            //all connection it tries to establish right now fail due to shutdown
            this.EnqueueIncoming(
                new NetworkEvent(NetEventType.ConnectionFailed, new ConnectionId(conId), null));
        }
        this.mConnecting = new Array<number>();

        //throw disconnect events for all NewConnection events in the outgoing queue
        //ignore messages and everything else
        for (let conId of this.mConnections) {
            //all connection it tries to establish right now fail due to shutdown
            this.EnqueueIncoming(
                new NetworkEvent(NetEventType.Disconnected, new ConnectionId(conId), null));
        }
        this.mConnections = new Array<number>();

        if (this.mServerStatus == WebsocketServerStatus.Starting) {

            //if server was Starting -> throw failed event
            this.EnqueueIncoming(
                new NetworkEvent(NetEventType.ServerInitFailed, ConnectionId.INVALID, null));
        } else if (this.mServerStatus == WebsocketServerStatus.Online) {

            //if server was Online -> throw close event
            this.EnqueueIncoming(
                new NetworkEvent(NetEventType.ServerClosed, ConnectionId.INVALID, null));
        } else if (this.mServerStatus == WebsocketServerStatus.ShuttingDown) {


            //if server was ShuttingDown -> throw close event (don't think this can happen)
            this.EnqueueIncoming(
                new NetworkEvent(NetEventType.ServerClosed, ConnectionId.INVALID, null));
        }
        this.mServerStatus = WebsocketServerStatus.Offline;


        this.mOutgoingQueue = new Array<NetworkEvent>();


        this.WebsocketCleanup();
        this.mStatus = WebsocketConnectionStatus.NotConnected;
    }

    private EnqueueOutgoing(evt: NetworkEvent): void {
        this.mOutgoingQueue.push(evt);
    }
    private EnqueueIncoming(evt: NetworkEvent): void {
        this.mIncomingQueue.push(evt);
    }
    private TryRemoveConnecting(id: ConnectionId): void {
        var index = this.mConnecting.indexOf(id.id);
        if (index != -1) {
            this.mConnecting.splice(index, 1);
        }
    }
    private TryRemoveConnection(id: ConnectionId): void {
        var index = this.mConnections.indexOf(id.id);
        if (index != -1) {
            this.mConnections.splice(index, 1);
        }
    }
    private HandleIncomingEvent(evt: NetworkEvent) {
        
        if (evt.Type == NetEventType.NewConnection) {
            //removing connecting info
            this.TryRemoveConnecting(evt.ConnectionId);

            //add connection
            this.mConnections.push(evt.ConnectionId.id);
        } else if (evt.Type == NetEventType.ConnectionFailed) {

            //remove connecting info
            this.TryRemoveConnecting(evt.ConnectionId);
        } else if (evt.Type == NetEventType.Disconnected) {

            //remove from connections
            this.TryRemoveConnection(evt.ConnectionId);

        } else if (evt.Type == NetEventType.ServerInitialized)
        {
            this.mServerStatus = WebsocketServerStatus.Online;

        } else if (evt.Type == NetEventType.ServerInitFailed)
        {
            this.mServerStatus = WebsocketServerStatus.Offline;

        } else if (evt.Type == NetEventType.ServerClosed)
        {
            this.mServerStatus = WebsocketServerStatus.ShuttingDown;
            //any cleaning up to do?
            this.mServerStatus = WebsocketServerStatus.Offline;
        }

        this.EnqueueIncoming(evt);
    }
    
    private HandleOutgoingEvents(): void {

        while (this.mOutgoingQueue.length > 0) {
            var evt = this.mOutgoingQueue.shift();
            //var msg = NetworkEvent.toString(evt);
            var msg = NetworkEvent.toByteArray(evt);
            this.mSocket.send(msg);
        }
    }


    private NextConnectionId(): ConnectionId {
        var result = this.mNextOutgoingConnectionId;
        this.mNextOutgoingConnectionId = new ConnectionId(this.mNextOutgoingConnectionId.id + 1);
        return result;
    }

    private GetRandomKey(): string {

        var result = "";
        for (var i = 0; i < 7; i++) {
            result += String.fromCharCode(65 + Math.round(Math.random() * 25));
        }
        return result;
    }



    //interface implementation

    public Dequeue(): NetworkEvent {
        if (this.mIncomingQueue.length > 0)
            return this.mIncomingQueue.shift();
        return null;
    }
    public Peek(): NetworkEvent {
        if (this.mIncomingQueue.length > 0)
            return this.mIncomingQueue[0];
        return null;
    }
    public Update(): void {

        this.CheckSleep();
    }
    public Flush(): void {
        //ideally we buffer everything and then flush when it is connected as
        //websockets aren't suppose to be used for realtime communication anyway
        if (this.mStatus == WebsocketConnectionStatus.Connected)
            this.HandleOutgoingEvents();
    }
    public SendData(id: ConnectionId, data: Uint8Array, /*offset: number, length: number,*/ reliable: boolean): boolean {
        if (id == null || data == null || data.length == 0)
            return;
        var evt: NetworkEvent;
        if (reliable) {
            evt = new NetworkEvent(NetEventType.ReliableMessageReceived, id, data);
        } else {
            evt = new NetworkEvent(NetEventType.UnreliableMessageReceived, id, data);
        }

        this.EnqueueOutgoing(evt);
        return true;
    }
    public Disconnect(id: ConnectionId): void {
        var evt = new NetworkEvent(NetEventType.Disconnected, id, null);
        this.EnqueueOutgoing(evt);
    }
    public Shutdown(): void {
        this.Cleanup();
        this.mStatus = WebsocketConnectionStatus.NotConnected;
    }
    
    public Dispose() {
        if (this.mIsDisposed == false) {
            this.Shutdown();
            this.mIsDisposed = true;
        }
    }


    public StartServer(): void;
    public StartServer(address: string): void;
    public StartServer(address?: string): void {
        if (address == null) {
            address = "" + this.GetRandomKey();
        }

        if (this.mServerStatus == WebsocketServerStatus.Offline) {

            this.EnsureServerConnection();
            this.mServerStatus = WebsocketServerStatus.Starting;
            //TODO: address is a string but ubytearray is defined. will fail if binary
            this.EnqueueOutgoing(new NetworkEvent(NetEventType.ServerInitialized, ConnectionId.INVALID, address));

        } else {

            this.EnqueueIncoming(new NetworkEvent(NetEventType.ServerInitFailed, ConnectionId.INVALID, address));

        }
    }

    public StopServer(): void {
        this.EnqueueOutgoing(new NetworkEvent(NetEventType.ServerClosed, ConnectionId.INVALID, null));
    }
    public Connect(address: string): ConnectionId {

        this.EnsureServerConnection();
        var newConId = this.NextConnectionId();
        this.mConnecting.push(newConId.id);
        var evt = new NetworkEvent(NetEventType.NewConnection, newConId, address);
        this.EnqueueOutgoing(evt);

        return newConId;
    }
}

//Below tests only. Move out later

function bufferToString(buffer: Uint8Array): string {
    let arr = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    return String.fromCharCode.apply(null, arr);
}

function stringToBuffer(str: string): Uint8Array {
    let buf = new ArrayBuffer(str.length * 2);
    let bufView = new Uint16Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }

    let result = new Uint8Array(buf);
    return result;
}
