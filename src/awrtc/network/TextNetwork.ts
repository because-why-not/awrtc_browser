/*
Copyright (c) 2021, because-why-not.com Limited
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




/**Example network that converts messages to string before forwarding it to the counter part
 * No actual network is involved. It simply gives each network an id and will connect the first
 * created network to the second one.
 */
export class TextNetwork implements IBasicNetwork  {

    public static readonly LOGTAG = "TextNetwork";

    //websocket. 
    private mSocket: WebSocket;

    
    private mIncomingQueue = new Array<NetworkEvent>();

    private mUrl: string = null;

    private mIsDisposed = false;

    private mIsOfferer = false;
    private mFirstMessage = true;
    
    private static instanceId = 0;
    private myIndex;
    private static instances:TextNetwork[] = [];


    public constructor(url: string) {
        this.mUrl = url;        

        //TODO: improve this. for now text_offer in the url forces it into offering mode
        if (this.mUrl.startsWith("text_offer")){
            this.mIsOfferer = true;
        } 

        //TODO: For we just connect two local instances for quick testing
        //so each gets an index and is put in a global list
        this.myIndex = TextNetwork.instanceId;
        TextNetwork.instanceId++;
        TextNetwork.instances.push(this);
    }
    
    //This is called with the text signaling messages. 
    private SendToOther(message: string) {
        const otherIndex = this.getOtherIndex();
        const other = TextNetwork.instances[otherIndex];

        //log who sends the message to who
        let prefix = "ANS->OFF: "
        if (this.mIsOfferer) {
            prefix = "OFF->ANS: "
        }
        console.log(prefix + message);

        other.Receive(message);
        
    }
    private Receive(message: string) {
        var newConId = new ConnectionId(1);
        if (this.mFirstMessage) {
            this.mFirstMessage = false;
            if (this.mIsOfferer == false) {
                //the peer that waits receives its first message. Make sure we add an event for to let it know a connection arrived
                
                var mevt = new NetworkEvent(NetEventType.NewConnection, newConId, null);
                this.EnqueueIncoming(mevt)
            }
        }

        //convert message back into the expected binary format
        const data: Uint8Array = stringToBuffer(message);
        const evt = new NetworkEvent(NetEventType.ReliableMessageReceived, newConId, data);
        this.EnqueueIncoming(evt)
    }
    
    //for testing we always send messages between two TextNetwork instances
    private getOtherIndex() {
        if (this.myIndex % 2 == 0) {
            return this.myIndex + 1;
        } else {
            return this.myIndex - 1;
        }        
    }
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
    }
    
    public Flush(): void {
        
    }
    public SendData(id: ConnectionId, data: Uint8Array, /*offset: number, length: number,*/ reliable: boolean): boolean {
        //this are the signaling messages the peer sends
        let message: string = bufferToString(data)
        this.SendToOther(message);
        return true;
    }
    public Disconnect(id: ConnectionId): void {
        
    }


    public StartServer(): void;
    public StartServer(address: string): void;
    public StartServer(address?: string): void {
        if (address == null) {
            address = "no_address";
        }
        if (this.mIsOfferer) {
            //if the peer is in offerer role we do not expect to act like a server (waiting for connections). 
            //the CallApp example will detect this event and then call connect instead (triggering the peer to send out an offer)
            this.EnqueueIncoming(
                new NetworkEvent(NetEventType.ServerInitFailed, ConnectionId.INVALID, null));
        } else {
            //this switches the peer into server mode. in this state it will wait for an offer
            this.EnqueueIncoming(new NetworkEvent(NetEventType.ServerInitialized, ConnectionId.INVALID, address));
        }
        
    }
    public StopServer(): void {
        
    }
    public Connect(address: string): ConnectionId {

        var newConId = new ConnectionId(1);
        
        var evt = new NetworkEvent(NetEventType.NewConnection, newConId, address);
        //tell the peer the connection is accepted to force it into sending an offer
        this.EnqueueIncoming(evt);

        return newConId;
    }

    
    public Shutdown(): void {
        
    }
    
    public Dispose() {
        if (this.mIsDisposed == false) {
            this.Shutdown();
            this.mIsDisposed = true;
        }
    }
    private EnqueueIncoming(evt: NetworkEvent): void {
        this.mIncomingQueue.push(evt);
    }
}


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