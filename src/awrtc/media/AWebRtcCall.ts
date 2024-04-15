/*
Copyright (c) 2023, because-why-not.com Limited
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
import { ICall } from "./ICall";
import { IMediaNetwork, MediaConfigurationState, StreamAddedEvent } from "./IMediaNetwork";
import { CallEventHandler, CallAcceptedEventArgs, CallEndedEventArgs, ErrorEventArgs, CallEventType, WaitForIncomingCallEventArgs, CallErrorType, DataMessageEventArgs, FrameUpdateEventArgs, CallEventArgs, MessageEventArgs, MediaUpdatedEventArgs } from "./CallEventArgs";
import { SLog, Encoding } from "../network/Helper";
import { NetworkConfig } from "../network/NetworkConfig";
import { MediaConfig } from "./MediaConfig";
import { ConnectionId, NetworkEvent, NetEventType } from "../network/index";
import { IFrameData } from "./RawFrame";
import { RtcEvent, RtcEventType, IWebRtcNetwork } from "../network/IWebRtcNetwork";

class CallException {
    private mErrorMsg: string;
    public ErrorMsg() {
    }
    public constructor(errorMsg: string) {
        this.mErrorMsg = errorMsg;
    }
}
class InvalidOperationException extends CallException
{
}
/// <summary>
/// State of the call. Mainly used to check for bugs / invalid states.
/// </summary>
enum CallState {
    /// <summary>
    /// Not yet initialized / bug
    /// </summary>
    Invalid = 0,
    /// <summary>
    /// Object is initialized but local media not yet configured
    /// </summary>
    Initialized = 1,

    /// <summary>
    /// In process of accessing the local media devices.
    /// </summary>
    Configuring = 2,
    /// <summary>
    /// Configured. Video/Audio can be accessed and call is ready to start
    /// </summary>
    Configured = 3,
    /// <summary>
    /// In process of requesting an address from the server to then listen and wait for
    /// an incoming call.
    /// </summary>
    RequestingAddress = 4,

    /// <summary>
    /// Call is listening on an address and waiting for an incoming call
    /// </summary>
    WaitingForIncomingCall = 5,

    /// <summary>
    /// Call is in the process of connecting to another call object.
    /// </summary>
    WaitingForOutgoingCall = 6,

    /// <summary>
    /// Indicating that the call object is at least connected to another object
    /// </summary>
    InCall = 7,
    //CallAcceptedIncoming,
    //CallAcceptedOutgoing,
    /// <summary>
    /// Call ended / conference room closed
    /// </summary>
    Closed = 8
}

/*
class ConnectionMetaData
{
}
*/
class ConnectionInfo{

    private mConnectionIds = new Array<number>();
    //private mConnectionMeta: { [id: number]: ConnectionMetaData } = {};


    public AddConnection(id: ConnectionId, incoming:boolean)
    {
        this.mConnectionIds.push(id.id);
        //this.mConnectionMeta[id.id] = new ConnectionMetaData();
    }

    public RemConnection(id:ConnectionId)
    {
        let index = this.mConnectionIds.indexOf(id.id);
        if(index >= 0){
            this.mConnectionIds.splice(index, 1);
        }
        else{
            SLog.LE("tried to remove an unknown connection with id " + id.id);
        }
        //delete this.mConnectionMeta[id.id];
    }

    public HasConnection(id:ConnectionId)
    {
        return this.mConnectionIds.indexOf(id.id) != -1;
    }

    public GetIds()
    {
        return this.mConnectionIds;
    }


    //public GetMeta(id:ConnectionId) : ConnectionMetaData
    //{
    //    return this.mConnectionMeta[id.id];
    //}
}

/**This class wraps an implementation of
 * IMediaStream and converts its polling system
 * to an easier to use event based system. 
 * 
 * Ideally use only features defined by 
 * ICall to avoid having to deal with internal changes
 * in future updates.
 */
export class AWebRtcCall implements ICall {

    private MESSAGE_TYPE_INVALID : number = 0;
    private MESSAGE_TYPE_DATA : number = 1;
    private MESSAGE_TYPE_STRING : number = 2;
    private MESSAGE_TYPE_CONTROL : number = 3;

    protected mNetworkConfig = new NetworkConfig();
    private mMediaConfig: MediaConfig = new MediaConfig();

    private mCallEventHandlers: Array<CallEventHandler> = [];
    public addEventListener(listener: CallEventHandler): void {
        this.mCallEventHandlers.push(listener);
    }
    public removeEventListener(listener: CallEventHandler): void {
        this.mCallEventHandlers = this.mCallEventHandlers.filter(h => h !== listener);
    }

    protected mNetwork: IMediaNetwork = null
    private mConnectionInfo = new ConnectionInfo();

    private mConferenceMode = false;

    private mState = CallState.Invalid;
    public get State(): CallState {
        return this.mState;
    }

    private mIsDisposed = false;

    private mServerInactive = true;




    private mPendingListenCall = false;
    private mPendingCallCall = false;
    private mPendingAddress = null;

    constructor(config: NetworkConfig = null) {
        if (config != null) {
            this.mNetworkConfig = config;
            this.mConferenceMode = config.IsConference;
        }
    }

    protected Initialize(network: IMediaNetwork): void {
        this.mNetwork = network;
        this.mState = CallState.Initialized;
    }
    
    public Configure(config: MediaConfig): void {
        this.CheckDisposed();
        /*
        if (this.mState != CallState.Initialized) {
            throw new InvalidOperationException("Method can't be used in state " + this.mState);
        }
        */
        this.mState = CallState.Configuring;
        SLog.Log("Enter state CallState.Configuring");
        this.mMediaConfig = config;
        this.mNetwork.Configure(this.mMediaConfig);
    }

    public Call(address: string): void {
        this.CheckDisposed();
        if (this.mState != CallState.Initialized
            && this.mState != CallState.Configuring
            && this.mState != CallState.Configured) {
            throw new InvalidOperationException("Method can't be used in state " + this.mState);
        }

        if (this.mConferenceMode) {
            throw new InvalidOperationException("Method can't be used in conference calls.");
        }
        SLog.Log("Call to " + address);

        this.EnsureConfiguration();

        if (this.mState == CallState.Configured) {
            this.ProcessCall(address);
        }
        else {
            this.PendingCall(address);
        }
    }
    public Listen(address: string): void {
        this.CheckDisposed();
        if (this.mState != CallState.Initialized
            && this.mState != CallState.Configuring
            && this.mState != CallState.Configured) {
            throw new InvalidOperationException("Method can't be used in state " + this.mState);
        }


        this.EnsureConfiguration();

        if (this.mState == CallState.Configured) {
            this.ProcessListen(address);
        }
        else {
            this.PendingListen(address);
        }
    }

    public Send(message: string, reliable?:boolean, id? :ConnectionId): void
    {
        this.CheckDisposed();
        if(reliable == null)
            reliable = true;
        if(id) {
            this.InternalSendTo(message, reliable, id);
        } else{
            this.InternalSendToAll(message, reliable);
        }
    }

    private InternalSendToAll(message: string, reliable:boolean): void {


        let data = this.PackStringMsg(message);;

        for (let id of this.mConnectionInfo.GetIds()) {
            SLog.L("Send message to " + id + "! " + message);
            this.InternalSendRawTo(data, new ConnectionId(id), reliable);
        }
    }
    private InternalSendTo(message: string, reliable:boolean, id :ConnectionId): void {

        let data = this.PackStringMsg(message);
        this.InternalSendRawTo(data, id, reliable);
    }


    public SendData(message: Uint8Array, reliable:boolean, id :ConnectionId): void {

        this.CheckDisposed();
        let data = this.PackDataMsg(message);
        this.InternalSendRawTo(data, id, reliable);
    }

    private PackStringMsg(message: string): Uint8Array {

        let data = Encoding.UTF16.GetBytes(message);
        
        let buff = new Uint8Array(data.length + 1);
        buff[0] = this.MESSAGE_TYPE_STRING;
        for(let i = 0; i < data.length; i++){
            buff[i + 1] = data[i];
        }
        return buff;
    }

    private UnpackStringMsg(message: Uint8Array): string
    {
        let buff = new Uint8Array(message.length - 1);
        
        for(let i = 0; i < buff.length; i++){
            buff[i] = message[i + 1];
        }
        let res = Encoding.UTF16.GetString(buff);

        return res;
    }

    private PackDataMsg(data: Uint8Array): Uint8Array {

        let buff = new Uint8Array(data.length + 1);
        buff[0] = this.MESSAGE_TYPE_DATA;
        for(let i = 0; i < data.length; i++){
            buff[i + 1] = data[i];
        }
        return buff;
    }

    private UnpackDataMsg(message: Uint8Array): Uint8Array
    {
        let buff = new Uint8Array(message.length - 1);
        
        for(let i = 0; i < buff.length; i++){
            buff[i] = message[i + 1];
        }
        return buff;
    }

    private InternalSendRawTo(rawdata: Uint8Array, id :ConnectionId, reliable: boolean) {
        this.mNetwork.SendData(id, rawdata, reliable);
    }



    

    public Update(): void {

        if (this.mIsDisposed)
            return;
        if (this.mNetwork == null)
            return;

        this.mNetwork.Update();

        //waiting for the media configuration?
        if (this.mState == CallState.Configuring) {
            var configState = this.mNetwork.GetConfigurationState();
            if (configState == MediaConfigurationState.Failed) {
                this.OnConfigurationFailed(this.mNetwork.GetConfigurationError());
                //bugfix: user might dispose the call during the event above
                if (this.mIsDisposed)
                    return;
                if (this.mNetwork != null)
                    this.mNetwork.ResetConfiguration();
            }
            else if (configState == MediaConfigurationState.Successful) {
                this.OnConfigurationComplete();
                if (this.mIsDisposed)
                    return;
            }
        }


        let evt: NetworkEvent;
        while ((evt = this.mNetwork.Dequeue()) != null) {
            switch (evt.Type) {
                case NetEventType.NewConnection:

                    if (this.mState == CallState.WaitingForIncomingCall
                        || (this.mConferenceMode && this.mState == CallState.InCall)) //keep accepting connections after 
                    {
                        //remove ability to accept incoming connections
                        if (this.mConferenceMode == false)
                            this.mNetwork.StopServer();

                        this.mState = CallState.InCall;
                        this.mConnectionInfo.AddConnection(evt.ConnectionId, true);
                        this.TriggerCallEvent(new CallAcceptedEventArgs(evt.ConnectionId));
                        if (this.mIsDisposed)
                            return;
                    }
                    else if (this.mState == CallState.WaitingForOutgoingCall) {
                        this.mConnectionInfo.AddConnection(evt.ConnectionId, false);
                        //only possible in 1 on 1 calls
                        this.mState = CallState.InCall;
                        this.TriggerCallEvent(new CallAcceptedEventArgs(evt.ConnectionId));
                        if (this.mIsDisposed)
                            return;
                    }
                    else {
                        //Debug.Assert(mState == CallState.WaitingForIncomingCall || mState == CallState.WaitingForOutgoingCall);

                        SLog.LogWarning("Received incoming connection during invalid state " + this.mState);

                    }

                    break;
                case NetEventType.ConnectionFailed:
                    //call failed
                    if (this.mState == CallState.WaitingForOutgoingCall) {
                        this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ConnectionFailed));
                        if (this.mIsDisposed)
                            return;
                        this.mState = CallState.Configured;
                    }
                    else {
                        //Debug.Assert(mState == CallState.WaitingForOutgoingCall);
                        SLog.LogError("Received ConnectionFailed during " + this.mState);
                    }
                    break;
                case NetEventType.Disconnected:

                    if (this.mConnectionInfo.HasConnection(evt.ConnectionId)) {
                        this.mConnectionInfo.RemConnection(evt.ConnectionId);
                        //call ended
                        if (this.mConferenceMode == false && this.mConnectionInfo.GetIds().length == 0) {
                            this.mState = CallState.Closed;
                        }
                        this.TriggerCallEvent(new CallEndedEventArgs(evt.ConnectionId));
                        if (this.mIsDisposed)
                            return;

                    }
                    break;
                case NetEventType.ServerInitialized:
                    //incoming calls possible
                    this.mServerInactive = false;

                    this.mState = CallState.WaitingForIncomingCall;
                    this.TriggerCallEvent(new WaitForIncomingCallEventArgs(evt.Info));
                    if (this.mIsDisposed)
                        return;
                    break;
                case NetEventType.ServerInitFailed:

                    this.mServerInactive = true;


                    //reset state to the earlier state which is Configured (as without configuration no
                    //listening possible). Local camera/audio will keep running
                    this.mState = CallState.Configured;
                    this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ListeningFailed));
                    if (this.mIsDisposed)
                        return;
                    break;
                case NetEventType.ServerClosed:
                    this.mServerInactive = true;
                    //no incoming calls possible anymore
                    if (this.mState == CallState.WaitingForIncomingCall || this.mState == CallState.RequestingAddress) {
                        this.mState = CallState.Configured;
                        //might need to be handled as a special timeout event?
                        this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ListeningFailed, CallErrorType.Unknown, "Server closed the connection while waiting for incoming calls."));
                        if (this.mIsDisposed)
                            return;
                    }
                    else {
                        //event is normal during other states as the server connection will be closed after receiving a call
                    }
                    break;
                    case NetEventType.ReliableMessageReceived:
                    case NetEventType.UnreliableMessageReceived:
                        let reliable = evt.Type === NetEventType.ReliableMessageReceived;
                        //chat message received
                        if(evt.MessageData.length >= 2)
                        {
                            if(evt.MessageData[0] == this.MESSAGE_TYPE_STRING)
                            {
                                let message = this.UnpackStringMsg(evt.MessageData);
                                this.TriggerCallEvent(new MessageEventArgs(evt.ConnectionId, message, reliable));
                            }else if(evt.MessageData[0] == this.MESSAGE_TYPE_DATA)
                            {
                                let message = this.UnpackDataMsg(evt.MessageData);
                                this.TriggerCallEvent(new DataMessageEventArgs(evt.ConnectionId, message, reliable));
                            }else{
                                //invalid message?
                            }
    
                        }else{
                            //invalid message?
                        }
                        if (this.mIsDisposed)
                            return;
                        break;
            }
        }
        let handleLocalFrames = true;
        let handleRemoteFrames = true;

        if (this.mMediaConfig.FrameUpdates && handleLocalFrames)
        {
            let localFrame = this.mNetwork.TryGetFrame(ConnectionId.INVALID);
            if (localFrame != null) {
                this.FrameToCallEvent(ConnectionId.INVALID, localFrame);
                if (this.mIsDisposed)
                    return;
            }
        }
        if (this.mMediaConfig.FrameUpdates && handleRemoteFrames)
        {
            for (var id of this.mConnectionInfo.GetIds())
            {
                let conId = new ConnectionId(id);
                let remoteFrame = this.mNetwork.TryGetFrame(conId);
                if (remoteFrame != null) {
                    this.FrameToCallEvent(conId, remoteFrame);
                    if (this.mIsDisposed)
                        return;
                }
            }
        }

        let rtcEvent : RtcEvent= null;
        while((rtcEvent = this.mNetwork.DequeueRtcEvent()) != null)
        {
            this.MediaEventToCallEvent(rtcEvent);
        }

        this.mNetwork.Flush();
    }

    private FrameToCallEvent(id:ConnectionId, frame:IFrameData)
    {
        let args = new FrameUpdateEventArgs(id, frame);
        this.TriggerCallEvent(args);
    }
    private MediaEventToCallEvent(inevt: RtcEvent)
    {
        if(inevt.EventType == RtcEventType.StreamAdded)
        {
            const evt = inevt as StreamAddedEvent;
            let args = new MediaUpdatedEventArgs(evt.ConnectionId, evt.Args as HTMLVideoElement);
            this.TriggerCallEvent(args);
        } else {
            SLog.L("Event type " + RtcEventType[inevt.EventType] + " ignored.");
        }
    }

    private PendingCall(address: string): void {
        this.mPendingAddress = address;
        this.mPendingCallCall = true;
        this.mPendingListenCall = false;
    }

    private ProcessCall(address: string): void {
        this.mState = CallState.WaitingForOutgoingCall;
        this.mNetwork.Connect(address);
        this.ClearPending();
    }

    private PendingListen(address: string): void {
        this.mPendingAddress = address;
        this.mPendingCallCall = false;
        this.mPendingListenCall = true;
    }
    private ProcessListen(address: string): void{
        SLog.Log("Listen at " + address);
        this.mServerInactive = false;
        this.mState = CallState.RequestingAddress;
        this.mNetwork.StartServer(address);
        this.ClearPending();
    }
    private DoPending(): void
    {
        if (this.mPendingCallCall) {
            this.ProcessCall(this.mPendingAddress);
        } else if (this.mPendingListenCall) {
            this.ProcessListen(this.mPendingAddress);
        }
        this.ClearPending();
    }
    private ClearPending(): void {
        this.mPendingAddress = null;
        this.mPendingCallCall = null;
        this.mPendingListenCall = null;
    }

    private CheckDisposed():void
    {
        if (this.mIsDisposed)
            throw new InvalidOperationException("Object is disposed. No method calls possible.");
    }


    private EnsureConfiguration(): void {
        if (this.mState == CallState.Initialized) {
            SLog.Log("Use default configuration");
            this.Configure(new MediaConfig());

        }
        else {

        }
    }

    private TriggerCallEvent(args: CallEventArgs): void {

        let arr = this.mCallEventHandlers.slice();

        for (let callback of arr) {
            callback(this, args);
        }
    }

    private OnConfigurationComplete(): void {
        if (this.mIsDisposed)
            return;
        this.mState = CallState.Configured;

        SLog.Log("Enter state CallState.Configured");
        this.TriggerCallEvent(new CallEventArgs(CallEventType.ConfigurationComplete));
        if (this.mIsDisposed == false)
            this.DoPending();
    }

    private OnConfigurationFailed(error: string): void {

        SLog.LogWarning("Configuration failed: " + error);
        if (this.mIsDisposed)
            return;
        this.mState = CallState.Initialized;
        this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ConfigurationFailed, CallErrorType.Unknown, error));
        //bugfix: user might dispose the call during the event above
        if (this.mIsDisposed == false)
            this.ClearPending();
    }

    protected DisposeInternal(disposing: boolean): void {

        //nothing to dispose but subclasses overwrite this
        if (!this.mIsDisposed) {
            if (disposing) {
            }
            this.mIsDisposed = true;
        }
    }

    public Dispose() : void
    {
        this.DisposeInternal(true);
    }
    HasAudioTrack(remoteUserId: ConnectionId): boolean {
        if (!this.mNetwork)
            return false;
        return this.mNetwork.HasAudioTrack(remoteUserId);
    }
    HasVideoTrack(remoteUserId: ConnectionId): boolean {
        if (!this.mNetwork)
            return false;
        return this.mNetwork.HasVideoTrack(remoteUserId);
    }
}
