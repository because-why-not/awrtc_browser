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
import {ConnectionId, NetworkEvent, NetEventType} from "./index"
import { Queue } from "./Helper";

interface IIdNetworkDictionary {
    [id: number]: LocalNetwork;
}
interface IAddressNetworkDictionary {
    [address: string]: LocalNetwork;
}

/**Helper to simulate the WebsocketNetwork or WebRtcNetwork 
 * within a local application without
 * any actual network components. 
 * 
 * This implementation might lack some features. 
 */
export class LocalNetwork{
    private static sNextId:number = 1;
    private static mServers = {} as IAddressNetworkDictionary;

    private mId:number;
    private mNextNetworkId = new ConnectionId(1);
    private mServerAddress : string = null;
    private mEvents = new Queue<NetworkEvent>();
    private mConnectionNetwork = {} as IIdNetworkDictionary;

    private mIsDisposed = false;

    public constructor() {

        this.mId = LocalNetwork.sNextId;
        LocalNetwork.sNextId++;
    }

    public get IsServer() {
        return this.mServerAddress != null;
    }


    public StartServer(serverAddress: string = null): void
    {
        if (serverAddress == null)
            serverAddress = "" + this.mId;

        if (serverAddress in LocalNetwork.mServers) {
            this.Enqueue(NetEventType.ServerInitFailed, ConnectionId.INVALID, serverAddress);
            return;
        }

        LocalNetwork.mServers[serverAddress] = this;
        this.mServerAddress = serverAddress;

        this.Enqueue(NetEventType.ServerInitialized, ConnectionId.INVALID, serverAddress);
    }
    public StopServer() : void
    {
        if (this.IsServer) {
            this.Enqueue(NetEventType.ServerClosed, ConnectionId.INVALID, this.mServerAddress);
            delete LocalNetwork.mServers[this.mServerAddress];
            this.mServerAddress = null;
        }
    }

    public Connect(address: string): ConnectionId
    {
        var connectionId = this.NextConnectionId();

        var sucessful = false;
        if (address in LocalNetwork.mServers) {
            let server = LocalNetwork.mServers[address];
            if (server != null) {
                server.ConnectClient(this);
                //add the server as local connection
                this.mConnectionNetwork[connectionId.id] = LocalNetwork.mServers[address];
                this.Enqueue(NetEventType.NewConnection, connectionId, null);
                sucessful = true;
            }
        }

        if (sucessful == false) {
            this.Enqueue(NetEventType.ConnectionFailed, connectionId, "Couldn't connect to the given server with id " + address);
        }

        return connectionId;
    }
        
    public  Shutdown() : void
    {
        for(var id in this.mConnectionNetwork) //can be changed while looping?
        {
            this.Disconnect(new ConnectionId(+id));
        }
        //this.mConnectionNetwork.Clear();
        this.StopServer();
    }

    public Dispose() : void{
        if (this.mIsDisposed == false) {
            this.Shutdown();
        }
    }

    public SendData(userId: ConnectionId, data: Uint8Array, reliable: boolean): boolean
    {

        if (userId.id in this.mConnectionNetwork)
        {
                let net = this.mConnectionNetwork[userId.id];
                net.ReceiveData(this, data,  reliable);
                return true;
        }
        return false;
    }

    public Update(): void
    {
        //work around for the GarbageCollection bug
        //usually weak references are removed during garbage collection but that
        //fails sometimes as others weak references get null to even though
        //the objects still exist!
        this.CleanupWreakReferences();
    }

    public Dequeue(): NetworkEvent
    {
        return this.mEvents.Dequeue();
    }
    public Peek(): NetworkEvent
    {
        return this.mEvents.Peek();
    }


    public Flush(): void
    {

    }

    public Disconnect(id: ConnectionId): void
    {
        if (id.id in this.mConnectionNetwork) {
            let other = this.mConnectionNetwork[id.id];
            if (other != null) {
                other.InternalDisconnectNetwork(this);
                this.InternalDisconnect(id);
            }
            else {
                //this is suppose to never happen but it does
                //if a server is destroyed by the garbage collector the client
                //weak reference appears to be NULL even though it still exists
                //bug?
                this.CleanupWreakReferences();
            }
        }
    }


    private FindConnectionId(network: LocalNetwork): ConnectionId
    {
        for(var kvp in this.mConnectionNetwork)
        {
            let network = this.mConnectionNetwork[kvp];
            if (network != null) {
                return new ConnectionId(+kvp);
            }
        }
        return ConnectionId.INVALID;
    }
    

    private NextConnectionId(): ConnectionId
    {
        let res = this.mNextNetworkId;
        this.mNextNetworkId = new ConnectionId(res.id + 1); 
        return res;
    }


    private ConnectClient(client: LocalNetwork): void
    {
        //if (this.IsServer == false)
        //    throw new InvalidOperationException();

        let nextId = this.NextConnectionId();
        //server side only
        this.mConnectionNetwork[nextId.id] = client;
        this.Enqueue(NetEventType.NewConnection, nextId, null);
    }

    private Enqueue(type: NetEventType, id: ConnectionId, data: any): void
    {
        let ev = new NetworkEvent(type, id, data);
        this.mEvents.Enqueue(ev);
    }

    private ReceiveData(network: LocalNetwork, data: Uint8Array, reliable : boolean): void
    {
        let userId = this.FindConnectionId(network);

        let buffer = new Uint8Array(data.length);
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = data[i];
        }


        let type = NetEventType.UnreliableMessageReceived;
        if (reliable)
            type = NetEventType.ReliableMessageReceived;
        this.Enqueue(type, userId, buffer);
    }
    private InternalDisconnect(id: ConnectionId): void
    {
        if (id.id in this.mConnectionNetwork) {
            this.Enqueue(NetEventType.Disconnected, id, null);
            delete this.mConnectionNetwork[id.id];
        }
    }

    private InternalDisconnectNetwork(ln: LocalNetwork): void
    {
        //if it can't be found it will return invalid which is ignored in internal disconnect
        this.InternalDisconnect(this.FindConnectionId(ln));
    }

    private CleanupWreakReferences(): void
    {
        //foreach(var kvp in mConnectionNetwork.Keys.ToList())
        //{
        //    var val = mConnectionNetwork[kvp];
        //    if (val.Get() == null) {
        //        InternalDisconnect(kvp);
        //    }
        //}
    }
}