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
/** Abstract interfaces and serialization to keep different
 * versions compatible to each other.
 * 
 * Watch out before changing anything in this file. Content is reused
 * between webclient, signaling server and needs to remain compatible to
 * the C# implementation.
 */

import { SLog } from "./Helper";

export enum NetEventType {
    Invalid = 0,
    UnreliableMessageReceived = 1,
    ReliableMessageReceived = 2,
    ServerInitialized = 3,//confirmation that the server was started. other people will be able to connect
    ServerInitFailed = 4,//server couldn't be started
    ServerClosed = 5,//server was closed. no new incoming connections
    NewConnection = 6,//new incoming or outgoing connection established
    ConnectionFailed = 7,//outgoing connection failed
    Disconnected = 8,//a connection was disconnected
    FatalError = 100, //not yet used
    Warning = 101,//not yet used
    Log = 102, //not yet used

    /// <summary>
    /// This value and higher are reserved for other uses. 
    /// Should never get to the user and should be filtered out.
    /// </summary>
    ReservedStart = 200,
    /// <summary>
    /// Reserved.
    /// Used by protocols that forward NetworkEvents
    /// </summary>
    MetaVersion = 201,
    /// <summary>
    /// Reserved.
    /// Used by protocols that forward NetworkEvents.
    /// </summary>
    MetaHeartbeat = 202
}
export enum NetEventDataType {
    Null = 0,
    ByteArray = 1, //leading 32 bit byte length + byte array
    UTF16String = 2, //leading 32 bit length (in utf16 chunks)  + UTF 16 
}

export class NetworkEvent {

    private type: NetEventType;
    private connectionId: ConnectionId;
    private data: any;

    constructor(t: NetEventType, conId: ConnectionId, data: any) {
        this.type = t;
        this.connectionId = conId;
        this.data = data;
    }

    public get RawData(): any {
        return this.data;
    }

    public get MessageData(): Uint8Array {
        if (typeof this.data != "string")
            return this.data;
        return null;
    }

    public get Info(): string {
        if (typeof this.data == "string")
            return this.data;
        return null;
    }

    public get Type(): NetEventType {
        return this.type;
    }
    public get ConnectionId(): ConnectionId {
        return this.connectionId;
    }

    //for debugging only
    public toString(): string {
        let output = "NetworkEvent[";
        output += "NetEventType: (";
        output += NetEventType[this.type];
        output += "), id: (";
        output += this.connectionId.id;
        output += "), Data: (";
        if (typeof this.data == "string") {
            output += this.data;
        }
        output += ")]";

        return output;
    }

    public static parseFromString(str: string): NetworkEvent {

        let values = JSON.parse(str);


        let data: any;
        if (values.data == null) {
            data = null;
        } else if (typeof values.data == "string") {
            data = values.data;
        } else if (typeof values.data == "object") {

            //json represents the array as an object containing each index and the
            //value as string number ... improve that later
            let arrayAsObject = values.data;
            var length = 0;
            for (var prop in arrayAsObject) {
                //if (arrayAsObject.hasOwnProperty(prop)) { //shouldnt be needed
                length++;
                //}
            }
            let buffer = new Uint8Array(Object.keys(arrayAsObject).length);
            for (let i = 0; i < buffer.length; i++)
                buffer[i] = arrayAsObject[i];
            data = buffer;
        } else {
            SLog.LogError("network event can't be parsed: " + str);
        }
        var evt = new NetworkEvent(values.type, values.connectionId, data);
        return evt;
    }

    public static toString(evt: NetworkEvent): string {
        return JSON.stringify(evt);
    }
    public static fromByteArray(arrin: Uint8Array): NetworkEvent {
        //old node js versions seem to not return proper Uint8Arrays but
        //buffers -> make sure it is a Uint8Array
        let arr : Uint8Array = new Uint8Array(arrin)

        let type: NetEventType = arr[0]; //byte
        let dataType: NetEventDataType = arr[1]; //byte
        let id: number = new Int16Array(arr.buffer, arr.byteOffset + 2, 1)[0]; //short

        
        let data: any = null;
        if (dataType == NetEventDataType.ByteArray) {

            let length: number = new Uint32Array(arr.buffer, arr.byteOffset + 4, 1)[0]; //uint
            let byteArray = new Uint8Array(arr.buffer, arr.byteOffset + 8, length);
            data = byteArray;

        } else if (dataType == NetEventDataType.UTF16String) {

            let length: number = new Uint32Array(arr.buffer, arr.byteOffset + 4, 1)[0]; //uint
            let uint16Arr = new Uint16Array(arr.buffer, arr.byteOffset + 8, length);

            let str: string = "";
            for (let i = 0; i < uint16Arr.length; i++) {
                str += String.fromCharCode(uint16Arr[i]);
            }
            data = str;
        } else if (dataType == NetEventDataType.Null) {
            //message has no data
        }
        else
        {
            throw new Error('Message has an invalid data type flag: ' + dataType);
        }

        let conId: ConnectionId = new ConnectionId(id);
        let result: NetworkEvent = new NetworkEvent(type, conId, data);
        return result;
    }
    public static toByteArray(evt: NetworkEvent): Uint8Array {

        let dataType: NetEventDataType;
        let length = 4; //4 bytes are always needed

        //getting type and length
        if (evt.data == null) {
            dataType = NetEventDataType.Null;
        } else if (typeof evt.data == "string") {
            dataType = NetEventDataType.UTF16String;
            let str: string = evt.data;
            length += str.length * 2 + 4;
        } else {
            dataType = NetEventDataType.ByteArray;
            let byteArray: Uint8Array = evt.data;
            length += 4 + byteArray.length;
        }

        //creating the byte array
        let result = new Uint8Array(length);
        result[0] = evt.type;;
        result[1] = dataType;

        let conIdField = new Int16Array(result.buffer, result.byteOffset + 2, 1);
        conIdField[0] = evt.connectionId.id;

        if (dataType == NetEventDataType.ByteArray) {

            let byteArray: Uint8Array = evt.data;
            let lengthField = new Uint32Array(result.buffer, result.byteOffset + 4, 1);
            lengthField[0] = byteArray.length;
            for (let i = 0; i < byteArray.length; i++) {
                result[8 + i] = byteArray[i];
            }
        } else if (dataType == NetEventDataType.UTF16String) {

            let str: string = evt.data;
            let lengthField = new Uint32Array(result.buffer, result.byteOffset + 4, 1);
            lengthField[0] = str.length;

            let dataField = new Uint16Array(result.buffer, result.byteOffset + 8, str.length);
            for (let i = 0; i < dataField.length; i++) {
                dataField[i] = str.charCodeAt(i);
            }

        }
        return result;
    }
}

export class ConnectionId {

    public static INVALID: ConnectionId = new ConnectionId(-1);

    id: number;

    constructor(nid: number) {
        this.id = nid;
    }


}
/// <summary>
/// Interface to a network that doesn't enforce storing any states.
/// 
/// Anything more is reusable between multiple different networks.
/// </summary>
export interface INetwork {
    /// <summary>
    /// This will return the incoming network events. Call this method and handle the incommen events until it returns false.
    /// </summary>
    /// <param name="evt"></param>
    /// <returns>Returns true if the parameter evt contains a new event. False if there are no events to process left.</returns>
    Dequeue(): NetworkEvent;

    Peek(): NetworkEvent;

    /// <summary>
    /// Sends buffered data.
    /// Might also clear all unused events from the queue!
    /// </summary>
    Flush(): void;

    /// <summary>
    /// Sends the content if a byte array to the given connection.
    /// </summary>
    /// <param name="id">The id of the recipient</param>
    /// <param name="data">Byte array containing the data to send</param>
    /// <param name="offset">The index in data where the network should start to send</param>
    /// <param name="length">Length in bytes you want to send</param>
    /// <param name="reliable">True to send a reliable message(tcp style) and false to send unreliable (udp style)</param>
    SendData(id: ConnectionId, data: Uint8Array, /*offset: number, length: number,*/ reliable: boolean): boolean

    /// <summary>
    /// Disconnects the given connection
    /// </summary>
    /// <param name="id">Id of the connection to disconnect.</param>
    Disconnect(id: ConnectionId): void;

    /// <summary>
    /// Disconnects all connection and shutsdown the server if started.
    /// Dequeue will still return the confirmation messages such as Disconnected event for each connection.
    /// 
    /// </summary>
    Shutdown(): void;

    /// <summary>
    /// Call this every frame if you intend to read incoming messages using Dequeue. This will make
    /// sure all data is read received by the network.
    /// </summary>
    Update(): void;

    Dispose(): void;
}

/// <summary>
/// Shared interface for WebRtcNetwork and UnityNetwork.
/// 
/// Keep in mind that in the current version the network can only act as a server (StartServer method) or 
/// as a client (via Connect method).
/// </summary>
export interface IBasicNetwork extends INetwork {

    /// <summary>
    /// Starts a new server. After the server is started the Dequeue method will return a
    /// ServerInitialized event with the address in the Info field.
    /// 
    /// If the server fails to start it will return a ServerInitFailed event. If the
    /// server is closed due to an error or the Shutdown method a ServerClosed event
    /// will be triggered.
    /// </summary>
    StartServer(address?: string): void;
    StopServer(): void

    /// <summary>
    /// Connects to a given address or roomname.
    /// 
    /// This call will result in one of those 2 events in response:
    /// * NewConnection if the connection was established
    /// * ConnectionFailed if the connection failed.
    /// 
    /// 
    /// </summary>
    /// <param name="address">A string that identifies the target.</param>
    /// <returns>Returns the Connection id the established connection will have (only supported by WebRtcNetwork).</returns>
    Connect(address: string): ConnectionId;
}
export interface IWebRtcNetwork extends IBasicNetwork {
    GetBufferedAmount(id: ConnectionId, reliable:boolean): number;
}
//export {NetEventType, NetworkEvent, ConnectionId, INetwork, IBasicNetwork};

