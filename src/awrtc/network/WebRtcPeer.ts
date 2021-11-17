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
import {IBasicNetwork, ConnectionId, NetworkEvent, NetEventType} from "./index"
import { Queue, Helper, SLog, Debug, Output, Random } from "./Helper";

export class SignalingConfig {
    private mNetwork: IBasicNetwork;

    constructor(network: IBasicNetwork) {
        this.mNetwork = network;
    }
    public GetNetwork(): IBasicNetwork {
        return this.mNetwork;
    }

}

export class SignalingInfo {

    private mSignalingConnected: boolean;
    public IsSignalingConnected(): boolean
    {
        return this.mSignalingConnected;
    }
    private mConnectionId: ConnectionId;
    public get ConnectionId() : ConnectionId
    {
        return this.mConnectionId;
    }

    private mIsIncoming: boolean;
    public IsIncoming(): boolean
    {
        return this.mIsIncoming;
    }


    private mCreationTime: number;

    public GetCreationTimeMs(): number
    {
        return Date.now() - this.mCreationTime;
    }

    public constructor(id: ConnectionId, isIncoming: boolean, timeStamp : number)
    {
        this.mConnectionId = id;
        this.mIsIncoming = isIncoming;
        this.mCreationTime = timeStamp;
        this.mSignalingConnected = true;
    }
    public SignalingDisconnected(): void
    {
        this.mSignalingConnected = false;
    }
}
export enum WebRtcPeerState {
    Invalid,
    Created, //freshly created peer. didn't start to connect yet but can receive message to trigger it
    Signaling, //webrtc started the process of connecting 2 peers
    SignalingFailed, //connection failed to be established -> either cleanup/close or try again (not yet possible)
    Connected, //connection is running
    Closing, //Used before Close call to block reaction to webrtc events coming back
    Closed //either Closed call finished or closed remotely or Cleanup/Dispose finished -> peer connection is destroyed and all resources are released
}
export enum WebRtcInternalState {
    None, //nothing happened yet
    Signaling, //Create Offer or CreateAnswer successfully called (after create callbacks)
    SignalingFailed, //Signaling failed
    Connected, //all channels opened
    Closed //at least one channel was closed
}
export abstract class AWebRtcPeer {

    private mState = WebRtcPeerState.Invalid;
    public GetState(): WebRtcPeerState {
        return this.mState;
    }

    //only written during webrtc callbacks
    private mRtcInternalState = WebRtcInternalState.None;

    protected mPeer: RTCPeerConnection;

    private mIncomingSignalingQueue: Queue<string> = new Queue<string>();
    private mOutgoingSignalingQueue: Queue<string> = new Queue<string>();


    //Used to negotiate who starts the signaling if 2 peers listening
    //at the same time
    private mDidSendRandomNumber = false;
    private mRandomNumerSent = 0;


    protected mOfferOptions: RTCOfferOptions = { "offerToReceiveAudio": false, "offerToReceiveVideo": false };
    
    private mReadyForIce = false;
    private mBufferedIceCandidates : RTCIceCandidate[] = [];


    constructor(rtcConfig: RTCConfiguration) {
        this.SetupPeer(rtcConfig);
        //remove this. it will trigger this call before the subclasses
        //are initialized
        this.OnSetup();
        this.mState = WebRtcPeerState.Created;
    }

    protected abstract OnSetup(): void;
    protected abstract OnStartSignaling(): void;
    protected abstract OnCleanup(): void;

    private SetupPeer(rtcConfig: RTCConfiguration): void {
        
        this.mPeer = new RTCPeerConnection(rtcConfig);
        this.mPeer.onicecandidate = this.OnIceCandidate;
        this.mPeer.oniceconnectionstatechange =  this.OnIceConnectionStateChange; 
        this.mPeer.onicegatheringstatechange = this.OnIceGatheringStateChange;
        this.mPeer.onnegotiationneeded = this.OnRenegotiationNeeded;
        this.mPeer.onconnectionstatechange = this.OnConnectionStateChange;
        this.mPeer.onsignalingstatechange = this.OnSignalingChange;

    }
    

    protected DisposeInternal(): void {
        this.Cleanup();
    }

    public Dispose(): void {

        if (this.mPeer != null) {
            this.DisposeInternal();
        }
    }

    private Cleanup(): void {
        //closing webrtc could cause old events to flush out -> make sure we don't call cleanup
        //recursively
        if (this.mState == WebRtcPeerState.Closed || this.mState == WebRtcPeerState.Closing) {
            return;
        }

        this.mState = WebRtcPeerState.Closing;

        this.OnCleanup();

        if (this.mPeer != null)
            this.mPeer.close();

        //js version still receives callbacks after this. would make it
        //impossible to get the state
        //this.mReliableDataChannel = null;
        //this.mUnreliableDataChannel = null;
        //this.mPeer = null;

        this.mState = WebRtcPeerState.Closed;
    }

    public Update(): void {

        if (this.mState != WebRtcPeerState.Closed && this.mState != WebRtcPeerState.Closing && this.mState != WebRtcPeerState.SignalingFailed)
            this.UpdateState();

        if (this.mState == WebRtcPeerState.Signaling || this.mState == WebRtcPeerState.Created)
            this.HandleIncomingSignaling();
    }

    private UpdateState(): void {
        //will only be entered if the current state isn't already one of the ending states (closed, closing, signalingfailed)

        if (this.mRtcInternalState == WebRtcInternalState.Closed) {
            //if webrtc switched to the closed state -> make sure everything is destroyed.

            //webrtc closed the connection. update internal state + destroy the references
            //to webrtc
            this.Cleanup();
            //mState will be Closed now as well
        } else if (this.mRtcInternalState == WebRtcInternalState.SignalingFailed) {
            //if webrtc switched to a state indicating the signaling process failed ->  set the whole state to failed
            //this step will be ignored if the peers are destroyed already to not jump back from closed state to failed
            this.mState = WebRtcPeerState.SignalingFailed;
        } else if (this.mRtcInternalState == WebRtcInternalState.Connected) {
            this.mState = WebRtcPeerState.Connected;
        }
    }

    private BufferIceCandidate(ice: RTCIceCandidate){
        this.mBufferedIceCandidates.push(ice);
    }

    /**Called after setRemoteDescription succeeded. 
     * After this call we accept ice candidates and add all buffered ice candidates we received 
     * until then. 
     * 
     * This is a workaround for problems between Safari & Firefox. Safari sometimes sends ice candidates before
     * it sends an answer causing an error in firefox.
     */
    private StartIce(){

        Debug.Log("accepting ice candidates");
        this.mReadyForIce = true;
        if(this.mBufferedIceCandidates.length > 0)
        {
            Debug.Log("adding locally buffered ice candidates");
            //signaling active. Forward ice candidates we received so far
            const candidates = this.mBufferedIceCandidates;
            this.mBufferedIceCandidates = [];
            for (var candidate of candidates) {
                this.AddIceCandidate(candidate);
            }
        }
    }
    private AddIceCandidate(ice: RTCIceCandidate){

        //based on the shim internals there is a risk it triggers errors outside of the promise
        try{
            let promise = this.mPeer.addIceCandidate(ice);
            promise.then(() => {/*success*/ });
            promise.catch((error: DOMError) => { Debug.LogError(error); });
        }catch(error){
            Debug.LogError(error);
        }
    }

    public HandleIncomingSignaling(): void {

        //handle the incoming messages all at once
        while (this.mIncomingSignalingQueue.Count() > 0) {
            let msgString: string = this.mIncomingSignalingQueue.Dequeue();

            let randomNumber = Helper.tryParseInt(msgString);
            if (randomNumber != null) {
                //was a random number for signaling negotiation

                //if this peer uses negotiation as well then
                //this would be true
                if (this.mDidSendRandomNumber) {
                    //no peer is set to start signaling -> the one with the bigger number starts

                    if (randomNumber < this.mRandomNumerSent) {
                        //own diced number was bigger -> start signaling
                        SLog.L("Signaling negotiation complete. Starting signaling.");
                        this.StartSignaling();
                    } else if (randomNumber == this.mRandomNumerSent) {
                        //same numbers. restart the process
                        this.NegotiateSignaling();
                    } else {
                        //wait for other peer to start signaling
                        SLog.L("Signaling negotiation complete. Waiting for signaling.");
                    }
                } else {
                    //ignore. this peer starts signaling automatically and doesn't use this
                    //negotiation
                }
            }
            else {
                //must be a webrtc signaling message using default json formatting

                let msg: any = JSON.parse(msgString);
                if (msg.sdp) {

                    let sdp: RTCSessionDescription = new RTCSessionDescription(msg as RTCSessionDescriptionInit);
                    if (sdp.type == 'offer') {
                        this.CreateAnswer(sdp);
                        //setTimeout(() => {  }, 5000);
                        
                    }
                    else {
                        //setTimeout(() => { }, 5000);
                        this.RecAnswer(sdp);
                    }
                } else {
                    let ice: RTCIceCandidate = new RTCIceCandidate(msg);
                    if (ice != null) {

                        if(this.mReadyForIce)
                        {
                            //expected normal behaviour
                            this.AddIceCandidate(ice);
                        }else{
                            
                            //Safari sometimes sends ice candidates before the answer message
                            //causing firefox to trigger an error
                            //buffer and reemit once setRemoteCandidate has been called
                            this.BufferIceCandidate(ice);
                        }
                    }
                }
            }

        }
    }

    public AddSignalingMessage(msg: string): void {
        Debug.Log("incoming Signaling message " + msg);
        this.mIncomingSignalingQueue.Enqueue(msg);
    }

    public DequeueSignalingMessage(/*out*/  msg: Output<string>): boolean {

        //lock might be not the best way to deal with this
        //lock(mOutgoingSignalingQueue)
        {
            if (this.mOutgoingSignalingQueue.Count() > 0) {
                msg.val = this.mOutgoingSignalingQueue.Dequeue();
                return true;
            }
            else {
                msg.val = null;
                return false;
            }
        }
    }

    private EnqueueOutgoing(msg: string): void {
        //lock(mOutgoingSignalingQueue)
        {
            Debug.Log("Outgoing Signaling message " + msg);
            this.mOutgoingSignalingQueue.Enqueue(msg);
        }
    }


    public StartSignaling(): void {

        this.OnStartSignaling();
        this.CreateOffer();
    }
    public NegotiateSignaling(): void {
        
        let nb = Random.getRandomInt(0, 2147483647);
        this.mRandomNumerSent = nb;
        this.mDidSendRandomNumber = true;
        this.EnqueueOutgoing("" + nb);
    }

    private CreateOffer(): void {
        Debug.Log("CreateOffer");

        


        let createOfferPromise = this.mPeer.createOffer(this.mOfferOptions);
        createOfferPromise.then((desc_in: RTCSessionDescription) => {
            let desc_out = this.ProcLocalSdp(desc_in);
            let msg: string = JSON.stringify(desc_out);

            let setDescPromise = this.mPeer.setLocalDescription(desc_in);

            setDescPromise.then(() => {
                this.RtcSetSignalingStarted();
                this.EnqueueOutgoing(msg);
            });
            setDescPromise.catch((error: DOMError) => {
                Debug.LogError(error);
                Debug.LogError("Error during setLocalDescription with sdp: " + JSON.stringify(desc_in));
                this.RtcSetSignalingFailed();
            });
        });
        createOfferPromise.catch((error: DOMError) => {
            Debug.LogError(error);
            this.RtcSetSignalingFailed();
        });
    }

    //Gives a specific codec priority over the others
    private EditCodecs(lines: string[]){

        let prefCodec = "H264";
        console.warn("sdp munging: prioritizing codec " + prefCodec);

        //index and list of all video codec id's
        //e.g.: m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 102 121 127 120 125 107 108 109 35 36 124 119 123 118 114 115 116
        let vcodecs_line_index;
        let vcodecs_line_split: string[];
        let vcodecs_list : string[];
        for(let i = 0; i < lines.length; i++){
            let line = lines[i];
            if(line.startsWith("m=video")){
                vcodecs_line_split= line.split(" ");
                vcodecs_list= vcodecs_line_split.slice(3, vcodecs_line_split.length);
                vcodecs_line_index = i;
                //console.log(vcodecs_list);
                break;
            }
        }
        //list of video codecs positioned based on our priority list
        let vcodecs_list_new : string[] = [] ;
        //start below the the m=video line
        for(let i = vcodecs_line_index + 1; i < lines.length; i++){
            let line = lines[i];
            let prefix = "a=rtpmap:";
            if(line.startsWith(prefix)){
                let subline = line.substr(prefix.length);
                let split = subline.split(" ");
                let codecId = split[0];
                let codecDesc = split[1];
                let codecSplit= codecDesc.split("/");
                let codecName = codecSplit[0];
                
                //sanity check. is this a video codec?
                if(vcodecs_list.includes(codecId)){
                    if(codecName === prefCodec){
                        vcodecs_list_new.unshift(codecId);
                    }else{
                        vcodecs_list_new.push(codecId);
                    }
                }
            }
        }
        //first 3 elements remain the same
        let vcodecs_line_new = vcodecs_line_split[0] + " " + vcodecs_line_split[1] + " " + vcodecs_line_split[2];
        //add new codec list after it
        vcodecs_list_new.forEach((x)=>{vcodecs_line_new = vcodecs_line_new + " " + x});
        //replace old line
        lines[vcodecs_line_index] = vcodecs_line_new;
    }

    //Replaces H264 profile levels
    //iOS workaround. Streaming from iOS to browser currently fails without this if
    //resolution is above 720p and h264 is active
    private EditProfileLevel(lines: string[]){
        const target_profile_level_id = "2a";
        //TODO: Make sure we only edit H264. There could be other codecs in the future
        //that look identical
        console.warn("sdp munging: replacing h264 profile-level with " + target_profile_level_id);
        let vcodecs_line_index;
        let vcodecs_line_split: string[];
        let vcodecs_list : string[];
        for(let i = 0; i < lines.length; i++){
            let line = lines[i];
            if(line.startsWith("a=fmtp:"))
            {
                //looking for profile-level-id=42001f
                //we replace the 1f
                let searchString = "profile-level-id=";
                let sublines = line.split(";");
                let updateLine = false;
                for(let k = 0; k < sublines.length; k++){
                    let subline = sublines[k];
                    if(subline.startsWith(searchString)){
                        let len = searchString.length + 4;
                        sublines[k] = sublines[k].substr(0, len) + target_profile_level_id;
                        updateLine = true;
                        break;
                    }
                }
                if(updateLine){
                    lines[i] = sublines.join(";");
                }
            }
        }
    }

    static MUNGE_SDP = false;
    
    private ProcLocalSdp(desc: RTCSessionDescription) :RTCSessionDescription {
        if(AWebRtcPeer.MUNGE_SDP === false)
            return desc

        console.warn("sdp munging active");
        let sdp_in = desc.sdp;
        let sdp_out = "";
        let lines = sdp_in.split("\r\n");

        this.EditCodecs(lines);
        //this.EditProfileLevel(lines);

        sdp_out = lines.join("\r\n");
        let desc_out = {type: desc.type, sdp: sdp_out} as RTCSessionDescription;
        return desc_out;
    }
    private ProcRemoteSdp(desc: RTCSessionDescription) : RTCSessionDescription{
        if(AWebRtcPeer.MUNGE_SDP === false)
            return desc;
        //console.warn("sdp munging active");
        return desc;
    }


    private CreateAnswer(offer: RTCSessionDescription): void {
        Debug.Log("CreateAnswer");
        
        offer = this.ProcRemoteSdp(offer);
        let remoteDescPromise = this.mPeer.setRemoteDescription(offer);
        remoteDescPromise.then(() => {
            this.StartIce();
            let createAnswerPromise = this.mPeer.createAnswer();
            createAnswerPromise.then((desc_in: RTCSessionDescription) => {
                let desc_out = this.ProcLocalSdp(desc_in);
                let msg: string = JSON.stringify(desc_out);
                let localDescPromise = this.mPeer.setLocalDescription(desc_in);
                localDescPromise.then(() => {
                    this.RtcSetSignalingStarted();
                    this.EnqueueOutgoing(msg);
                });
                localDescPromise.catch((error: DOMError) => {
                    Debug.LogError(error);
                    this.RtcSetSignalingFailed();
                });
                
            });
            createAnswerPromise.catch( (error: DOMError) => {
                Debug.LogError(error);
                this.RtcSetSignalingFailed();
            });
            
        });
        remoteDescPromise.catch((error: DOMError) => {
            Debug.LogError(error);
            this.RtcSetSignalingFailed();
        });
    }


    private RecAnswer(answer: RTCSessionDescription): void {
        Debug.Log("RecAnswer");
        answer = this.ProcRemoteSdp(answer);
        let remoteDescPromise = this.mPeer.setRemoteDescription(answer);
        remoteDescPromise.then(() => {
            //all done
            this.StartIce();
        });
        remoteDescPromise.catch((error: DOMError) => {
            Debug.LogError(error);
            this.RtcSetSignalingFailed();
        });
        
    }

    private RtcSetSignalingStarted(): void {
        if (this.mRtcInternalState == WebRtcInternalState.None) {
            this.mRtcInternalState = WebRtcInternalState.Signaling;
        }
    }
    protected RtcSetSignalingFailed(): void {
        this.mRtcInternalState = WebRtcInternalState.SignalingFailed;
    }

    protected RtcSetConnected(): void {
        if (this.mRtcInternalState == WebRtcInternalState.Signaling)
            this.mRtcInternalState = WebRtcInternalState.Connected;
    }
    protected RtcSetClosed(): void {
        if (this.mRtcInternalState == WebRtcInternalState.Connected)
        {
            Debug.Log("triggering closure");
            this.mRtcInternalState = WebRtcInternalState.Closed;
        }
            
    }

    

    private OnIceCandidate = (ev: RTCPeerConnectionIceEvent): void =>
    {
        if (ev && ev.candidate) {
            let candidate = ev.candidate;
            let msg: string = JSON.stringify(candidate);
            this.EnqueueOutgoing(msg);
        }
    }


    private OnIceConnectionStateChange = (ev: Event): void =>
    {
        Debug.Log("oniceconnectionstatechange: " + this.mPeer.iceConnectionState);
        //Chrome stopped emitting "failed" events. We have to react to disconnected events now
        if (this.mPeer.iceConnectionState == "failed" || this.mPeer.iceConnectionState == "disconnected")
        {
            if(this.mState == WebRtcPeerState.Signaling)
            {
                this.RtcSetSignalingFailed();
            }else if(this.mState == WebRtcPeerState.Connected)
            {
                this.RtcSetClosed();
            }
        }
    }

    /*
    So far useless. never triggered in firefox.
    In Chrome it triggers together with the DataChannels opening which might be more useful in the future
    */
    private OnConnectionStateChange = (ev:Event): void =>
    {
        Debug.Log("onconnectionstatechange: " + this.mPeer.iceConnectionState);
    }

    private OnIceGatheringStateChange = (ev:Event): void =>
    {
        Debug.Log("onicegatheringstatechange: " + this.mPeer.iceGatheringState);
    }

    private OnRenegotiationNeeded = (ev:Event): void =>
    {

    }

    //broken in chrome. won't switch to closed anymore
    private OnSignalingChange = (ev:Event): void =>
    {
        Debug.Log("onsignalingstatechange:" + this.mPeer.signalingState);
        //obsolete
        if (this.mPeer.signalingState == "closed") {
            this.RtcSetClosed();
        }
    }
}

export class WebRtcDataPeer extends AWebRtcPeer {

    private mConnectionId: ConnectionId;
    public get ConnectionId(): ConnectionId {
        return this.mConnectionId;
    }

    private mInfo: SignalingInfo = null;
    public get SignalingInfo(): SignalingInfo {
        return this.mInfo;
    }
    public SetSignalingInfo(info: SignalingInfo) {
        this.mInfo = info;
    }

    private mEvents: Queue<NetworkEvent> = new Queue<NetworkEvent>();


    private static sLabelReliable: string = "reliable";
    private static sLabelUnreliable: string = "unreliable";
    private mReliableDataChannelReady: boolean = false;
    private mUnreliableDataChannelReady: boolean = false;

    private mReliableDataChannel: RTCDataChannel;
    private mUnreliableDataChannel: RTCDataChannel;


    public constructor(id: ConnectionId, rtcConfig: RTCConfiguration) {
        super(rtcConfig);
        this.mConnectionId = id;
    }

    protected OnSetup():void {
        this.mPeer.ondatachannel = (ev: Event) => { this.OnDataChannel((ev as any).channel); };
    }

    protected OnStartSignaling(): void {

        let configReliable: RTCDataChannelInit = {} as RTCDataChannelInit;
        this.mReliableDataChannel = this.mPeer.createDataChannel(WebRtcDataPeer.sLabelReliable, configReliable);
        this.RegisterObserverReliable();

        let configUnreliable: RTCDataChannelInit = {} as RTCDataChannelInit;
        configUnreliable.maxRetransmits = 0;
        configUnreliable.ordered = false;
        this.mUnreliableDataChannel = this.mPeer.createDataChannel(WebRtcDataPeer.sLabelUnreliable, configUnreliable);
        this.RegisterObserverUnreliable();
    }

    protected OnCleanup(): void {
        if (this.mReliableDataChannel != null)
            this.mReliableDataChannel.close();

        if (this.mUnreliableDataChannel != null)
            this.mUnreliableDataChannel.close();

        //dont set to null. handlers will be called later
    }

    private RegisterObserverReliable(): void {
        this.mReliableDataChannel.onmessage = (event: MessageEvent) => { this.ReliableDataChannel_OnMessage(event); };
        this.mReliableDataChannel.onopen = (event: Event) => { this.ReliableDataChannel_OnOpen(); };
        this.mReliableDataChannel.onclose = (event: Event) => { this.ReliableDataChannel_OnClose(); };
        this.mReliableDataChannel.onerror = (event: Event) => { this.ReliableDataChannel_OnError(""); }; //should the event just be a string?
    }

    private RegisterObserverUnreliable(): void {
        this.mUnreliableDataChannel.onmessage = (event: MessageEvent) => { this.UnreliableDataChannel_OnMessage(event); };
        this.mUnreliableDataChannel.onopen = (event: Event) => { this.UnreliableDataChannel_OnOpen(); };
        this.mUnreliableDataChannel.onclose = (event: Event) => { this.UnreliableDataChannel_OnClose(); };
        this.mUnreliableDataChannel.onerror = (event: Event) => { this.UnreliableDataChannel_OnError(""); };//should the event just be a string?
    }


    public SendData(data: Uint8Array,/* offset : number, length : number,*/ reliable: boolean): boolean {
        //let buffer: ArrayBufferView = data.subarray(offset, offset + length) as ArrayBufferView;
        let buffer: ArrayBufferView = data as ArrayBufferView;
        let MAX_SEND_BUFFER = 1024 * 1024;
        //chrome bug: If the channels is closed remotely trough disconnect
        //then the local channel can appear open but will throw an exception
        //if send is called
        let sentSuccessfully = false;
        try {
            if (reliable) {
                if (this.mReliableDataChannel.readyState === "open")
                {
                    //bugfix: WebRTC seems to simply close the data channel if we send
                    //too much at once. avoid this from now on by returning false
                    //if the buffer gets too full
                    if((this.mReliableDataChannel.bufferedAmount + buffer.byteLength) < MAX_SEND_BUFFER)
                    {
                        this.mReliableDataChannel.send(buffer);
                        sentSuccessfully = true;
                    }
                }
            }
            else {
                if (this.mUnreliableDataChannel.readyState === "open")
                {
                    if((this.mUnreliableDataChannel.bufferedAmount + buffer.byteLength) < MAX_SEND_BUFFER)
                    {
                        this.mUnreliableDataChannel.send(buffer);
                        sentSuccessfully = true;
                    }
                }
            }
        } catch (e) {
            SLog.LogError("Exception while trying to send: " + e);
        }
        return sentSuccessfully;
    }
    public GetBufferedAmount(reliable: boolean): number {

        let result = -1;
        try {
            if (reliable) {
                if (this.mReliableDataChannel.readyState === "open")
                {
                    result = this.mReliableDataChannel.bufferedAmount;
                }
            }
            else {
                if (this.mUnreliableDataChannel.readyState === "open")
                {
                    result = this.mUnreliableDataChannel.bufferedAmount;
                }
            }
        } catch (e) {
            SLog.LogError("Exception while trying to access GetBufferedAmount: " + e);
        }
        return result;
    }

    public DequeueEvent(/*out*/ ev: Output<NetworkEvent>): boolean {
        //lock(mEvents)
        {
            if (this.mEvents.Count() > 0) {
                ev.val = this.mEvents.Dequeue();
                return true;
            }
        }
        return false;
    }

    private Enqueue(ev: NetworkEvent): void {
        //lock(mEvents)
        {
            this.mEvents.Enqueue(ev);
        }

    }



    public OnDataChannel(data_channel: RTCDataChannel): void {
        let newChannel = data_channel;
        if (newChannel.label == WebRtcDataPeer.sLabelReliable) {
            this.mReliableDataChannel = newChannel;
            this.RegisterObserverReliable();
        }
        else if (newChannel.label == WebRtcDataPeer.sLabelUnreliable) {
            this.mUnreliableDataChannel = newChannel;
            this.RegisterObserverUnreliable();
        }
        else {
            Debug.LogError("Datachannel with unexpected label " + newChannel.label);
        }

    }

    private RtcOnMessageReceived(event: MessageEvent, reliable: boolean): void {
        let eventType = NetEventType.UnreliableMessageReceived;
        if (reliable) {
            eventType = NetEventType.ReliableMessageReceived;
        }

        //async conversion to blob/arraybuffer here
        if (event.data instanceof ArrayBuffer) {

            let buffer = new Uint8Array(event.data);
            this.Enqueue(new NetworkEvent(eventType, this.mConnectionId, buffer));

        } else if (event.data instanceof Blob) {
            var connectionId = this.mConnectionId;
            var fileReader = new FileReader();
            var self: WebRtcDataPeer = this;
            fileReader.onload = function () {
                //need to use function as this pointer is needed to reference to the data
                let data = this.result as ArrayBuffer;
                let buffer = new Uint8Array(data);
                self.Enqueue(new NetworkEvent(eventType, self.mConnectionId, buffer));
            };
            fileReader.readAsArrayBuffer(event.data);

        } else {
            Debug.LogError("Invalid message type. Only blob and arraybuffer supported: " + event.data);
        }
    }


    private ReliableDataChannel_OnMessage(event: MessageEvent): void {
        Debug.Log("ReliableDataChannel_OnMessage ");
        this.RtcOnMessageReceived(event, true);
    }

    private ReliableDataChannel_OnOpen(): void {
        Debug.Log("mReliableDataChannelReady");
        this.mReliableDataChannelReady = true;
        if (this.IsRtcConnected()) {
            this.RtcSetConnected();
            Debug.Log("Fully connected");
        }
    }

    private ReliableDataChannel_OnClose(): void {
        this.RtcSetClosed();
    }

    private ReliableDataChannel_OnError(errorMsg: string) : void
    {
        Debug.LogError(errorMsg);
        this.RtcSetClosed();
    }

    private UnreliableDataChannel_OnMessage(event: MessageEvent): void {
        Debug.Log("UnreliableDataChannel_OnMessage ");
        this.RtcOnMessageReceived(event, false);
    }

    private UnreliableDataChannel_OnOpen(): void {
        Debug.Log("mUnreliableDataChannelReady");
        this.mUnreliableDataChannelReady = true;
        if (this.IsRtcConnected()) {
            this.RtcSetConnected();
            Debug.Log("Fully connected");
        }
    }

    private UnreliableDataChannel_OnClose(): void {
        this.RtcSetClosed();
    }

    private UnreliableDataChannel_OnError(errorMsg: string): void {
        Debug.LogError(errorMsg);
        this.RtcSetClosed();
    }

    private IsRtcConnected(): boolean {
        return this.mReliableDataChannelReady && this.mUnreliableDataChannelReady;
    }


}