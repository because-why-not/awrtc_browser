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
import { Queue, Helper, SLog, Debug, Output, Random, SLogger } from "./Helper";
import { NetworkConfig } from "index";
import { RtcEvent, StatsEvent } from "./IWebRtcNetwork";


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
    SignalingFailed, //connection failed to be established -> either cleanup/close or try again
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


interface AnyRTCStatsReport extends RTCStatsReport {
    values():any
}

export class PeerConfig{
    public RtcConfig: RTCConfiguration;
    public MaxIceRestart: number;

    constructor(netConfig: NetworkConfig) {
        
        this.MaxIceRestart = netConfig.MaxIceRestart;
        this.RtcConfig = netConfig.BuildRtcConfig();
    }
    
}

export abstract class AWebRtcPeer {
    //activates additional log messages
    public readonly DEBUG = false;



    public LOG_SIGNALING = true;

    //true will activate the ice restart mechanism. false means it will destroy the peer on "failed" event
    protected USE_ICE_RESTART: boolean;
    //TODO: Check for better handling of ice restart & data channels on firefox
    //on chrome data channels remain open during ice failed and continue to work after ice restart
    //on firefox they (sometimes) permanently close and never recover
    //for now we simply ignore the closed event which would usually trigger a complete closure of this peer
    //Only active if MAX_RETRIES > 0
    //This is off by default for now meaning ice restart won't work reliably if firefox is involved
    protected USE_ICE_RESTART_DC_WORKAROUND = false;
    protected MAX_RETRIES = 2;
    private mRetries = 0;
    //private mReconnectInterval?: ReturnType<typeof setTimeout> = null;

    private mState = WebRtcPeerState.Invalid;
    public GetState(): WebRtcPeerState {
        return this.mState;
    }

    //private mReconnectInterval?: ReturnType<typeof setTimeout> = null;
    //only written during webrtc callbacks
    private mRtcInternalState = WebRtcInternalState.None;

    protected mPeer: RTCPeerConnection;

    private mIncomingSignalingQueue: Queue<string> = new Queue<string>();
    private mOutgoingSignalingQueue: Queue<string> = new Queue<string>();

    
    
    /**new experimental peer configuration: It tries to avoid negotiation to allow cutting the signaling connection
     * For this transceivers are always created with sendrecv even if no track is available yet. 
     * Later replaceTrack is used to attach / detach any tracks
     * This causes a bug in browsers though: If an audio track is active but no video track yet audio playback does not start
     */
     public readonly SINGLE_NEGOTIATION = false;

     //Decides how offer/answer roles are treated if renegotiation is triggered after the first connection succeeded
     //true = offer/answer role is decided using random numbers to avoid collisions
     //false = keeps offer/answer role the same - this is faster but can cause an error if both sides trigger renegotiation at the same time
    public readonly RENEGOTATE_ROLES = true;
    

    //true - We are in the process of sending random numbers back & forth between the peers to decide
    //who will be offerer / answerer
    private mInActiveRoleNegotiation = false;

    //true - by default we attempt to negotiate roles and fall back if we receive an offer/answer instead of a random number
    //
    //This is automatically set to false once StartSignaling is called and results in this peer ignoring random numbers until signaling is completed
    private mUseRoleNegotiation = true;
    private mRandomNumberSent = 0;


    
    private mReadyForIce = false;
    private mBufferedIceCandidates: RTCIceCandidate[] = [];
    //True means this peer will permanently have the offerer role
    protected mIsOfferer = false;


    private static sNextId = 0;
    protected readonly mId;
    protected log: SLogger;

    constructor(peerConfig: PeerConfig, baseLogger: SLogger) {
        this.mId = AWebRtcPeer.sNextId++;
        this.log = baseLogger.CreateSub("Peer" + this.mId);
        this.USE_ICE_RESTART = peerConfig.MaxIceRestart > 0;
        this.MAX_RETRIES = peerConfig.MaxIceRestart;
        this.SetupPeer(peerConfig.RtcConfig);
        //remove this. it will trigger this call before the subclasses
        //are initialized
        this.OnSetup();
        this.mState = WebRtcPeerState.Created;
        if(this.DEBUG)
            (window as any)["peer"+this.mId] = this;
    }
    
    protected abstract OnSetup(): void;
    protected abstract OnStartSignaling(): void;
    protected abstract OnCleanup(): void;

    private SetupPeer(rtcConfig: RTCConfiguration): void {
        
        this.mPeer = new RTCPeerConnection(rtcConfig);
        this.mPeer.onicecandidate = this.OnIceCandidate;

        //this.mPeer.oniceconnectionstatechange =  this.OnIceConnectionStateChange; 
        this.mPeer.onconnectionstatechange = this.OnConnectionStateChange;
        this.mPeer.onicegatheringstatechange = this.OnIceGatheringStateChange;
        this.mPeer.onnegotiationneeded = this.OnNegotiationNeeded;

        this.mPeer.onsignalingstatechange = this.OnSignalingChange;
    }
    

    protected DisposeInternal(): void {
        this.Cleanup("Dispose was called");
    }

    public Dispose(): void {
        if (this.mPeer != null) {
            this.DisposeInternal();
        }
    }

    private Cleanup(reason:string): void {
        
        //closing webrtc could cause old events to flush out -> make sure we don't call cleanup
        //recursively
        if (this.mState == WebRtcPeerState.Closed || this.mState == WebRtcPeerState.Closing) {
            return;
        }

        this.mState = WebRtcPeerState.Closing;
        this.log.L("Peer is closing down. reason: " + reason);
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

        //if (this.mState == WebRtcPeerState.Signaling || this.mState == WebRtcPeerState.Created)
        this.HandleIncomingSignaling();
    }

    private UpdateState(): void {
        //will only be entered if the current state isn't already one of the ending states (closed, closing, signalingfailed)

        if (this.mRtcInternalState == WebRtcInternalState.Closed) {
            //if webrtc switched to the closed state -> make sure everything is destroyed.

            //webrtc closed the connection. update internal state + destroy the references
            //to webrtc
            this.Cleanup("WebRTC triggered an event to initiate shutdown (see log above).");
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

        if(this.DEBUG)
            this.log.L("accepting ice candidates. buffered " + this.mBufferedIceCandidates.length);
        this.mReadyForIce = true;
        if(this.mBufferedIceCandidates.length > 0)
        {
            if(this.DEBUG)
                this.log.L("adding locally buffered ice candidates");
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
            promise.catch((error: any) => {
                this.log.LW("Error during promise addIceCandidate: " + error + "! ice candidate ignored: " + JSON.stringify(ice));
            });
        }catch(error){
            this.log.LW("Error during call to addIceCandidate: " + error + "! ice candidate ignored: " + JSON.stringify(ice));
        }
    }

    public HandleIncomingSignaling(): void {

        //handle the incoming messages all at once
        while (this.mIncomingSignalingQueue.Count() > 0) {
            let msgString: string = this.mIncomingSignalingQueue.Dequeue();

            let randomNumber = Helper.tryParseInt(msgString);
            if (randomNumber != null) {
                
                if (this.mUseRoleNegotiation)
                {
                    //We use random numbers as tie breaker in several situations:
                    // 1. The signaling connects two peers without one of the peers starting the connection (shared_address mode)
                    //   in which case both sides get a new "incoming" connection and will send out random numbers immediately
                    // 2. The server uses custom code and sends a random number to force the client into offer or answerer role 
                    // 3. Renegotiation was triggered
                    if (this.mInActiveRoleNegotiation === false) {
                        //the other side triggered a role negotiation without us knowing -> also trigger our side first
                        this.log.L("Remote side requested renegotiation.");
                        this.NegotiateSignaling();
                    }
                    
                    if (randomNumber < this.mRandomNumberSent) {
                        //own diced number was bigger -> start signaling
                        this.log.L("Role negotiation complete. Starting signaling.");
                        this.StartSignalingInternal();
                    } else if (randomNumber == this.mRandomNumberSent) {
                        //same numbers. restart the process
                        this.log.L("Retrying role negotiation");
                        this.NegotiateSignaling();
                    } else {
                        //wait for other peer to start signaling
                        this.log.L("Role negotiation complete. Waiting for signaling.");
                    }
                } else {
                    //ignore random number from the other side. This peer has deactivated it
                    this.log.L("Other side attempted role negotiation but this is inactive. Ignored " + randomNumber);
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
        if (this.LOG_SIGNALING)
            this.log.L("incoming Signaling message " + msg);
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
            if (this.LOG_SIGNALING)
                this.log.L("Outgoing Signaling message " + msg);
            this.mOutgoingSignalingQueue.Enqueue(msg);
        }
    }

    //Starts signaling. This forces this peer to create an offer. The other side must automatically
    //switch to answer role
    public StartSignaling(): void {
        //user triggers signaling. For backwards compatibility we turn off
        //role negotiation which always means this peer creates the offer
        SLog.L("StartSignaling signaling by forcing offer role");
        this.mUseRoleNegotiation = false;
        this.StartSignalingInternal();
    }

    //Triggers data channel setup if needed and then creates & sends an offer
    private StartSignalingInternal(): void {
        this.OnStartSignaling();
        this.CreateOffer();
    }
    //Similar to StartSignaling but this will first send out a random number
    //the higher number starts signaling and creates an offer
    public NegotiateSignaling(): void {
        //0 - reserved to force a remote peer into answer mode
        //2147483647 - reserved to force a remote peer into offer mode
        let nb = Random.getRandomInt(1, 2147483647);
        this.mRandomNumberSent = nb;
        this.mInActiveRoleNegotiation = true;
        SLog.L("Attempting to negotiate signaling using number " + this.mRandomNumberSent);
        this.EnqueueOutgoing("" + nb);
    }

    /**Triggers the actual createOffer method on the Peer
     * Can be overridden to ensure specific transceiver configurations are performed
     * before the actual answer is created.
     * @returns Promise returned by createOffer
     */
    protected async CreateOfferImpl() {
        const mOfferOptions: RTCOfferOptions = { "offerToReceiveAudio": false, "offerToReceiveVideo": false };
        return this.mPeer.createOffer(mOfferOptions);
    }

    private CreateOffer(): void {
        this.mIsOfferer = true;
        this.mReadyForIce = false;
        this.mInActiveRoleNegotiation = false;
        


        this.log.L("CreateOffer");
        let createOfferPromise = this.CreateOfferImpl();
        createOfferPromise.then((desc_in: RTCSessionDescription) => {
            let desc_out = this.ProcessLocalSdp(desc_in);
            let msg: string = JSON.stringify(desc_out);

            let setDescPromise = this.mPeer.setLocalDescription(desc_in);

            setDescPromise.then(async () => {
                this.RtcSetSignalingStarted();
                this.EnqueueOutgoing(msg);
            });
            setDescPromise.catch((error: any) => {
                this.log.LE(error);
                this.log.LE("Error during setLocalDescription with sdp: " + JSON.stringify(desc_in));
                this.RtcSetSignalingFailed("Failed to set the offer as local description.");
            });
        });
        createOfferPromise.catch((error: any) => {
            this.log.LE(error);
            this.RtcSetSignalingFailed("Failed to create an offer.");
        });
    }

    protected ProcessLocalSdp(desc: RTCSessionDescription): RTCSessionDescription
    {
        return desc;
    }
    protected ProcessRemoteSdp(desc: RTCSessionDescription): RTCSessionDescription
    {
        return desc;
    }

    /**Triggers the actual createAnswer method on the Peer
     * Can be overridden to ensure specific transceiver configurations are performed
     * before the actual answer is created.
     * @returns Promise returned by createAnswer
     */
    protected async CreateAnswerImpl() {
        return this.mPeer.createAnswer();
    }


    private CreateAnswer(offer: RTCSessionDescription): void {
        this.log.L("CreateAnswer");
        this.mInActiveRoleNegotiation = false;
        this.mReadyForIce = false;
        
        offer = this.ProcessRemoteSdp(offer);
        let remoteDescPromise = this.mPeer.setRemoteDescription(offer);
        remoteDescPromise.then(() => {
            this.StartIce();
            let createAnswerPromise = this.CreateAnswerImpl();
            createAnswerPromise.then((desc_in: RTCSessionDescription) => {
                let desc_out = this.ProcessLocalSdp(desc_in);
                let msg: string = JSON.stringify(desc_out);
                let localDescPromise = this.mPeer.setLocalDescription(desc_in);
                localDescPromise.then(() => {
                    this.RtcSetSignalingStarted();
                    this.EnqueueOutgoing(msg);
                });
                localDescPromise.catch((error: any) => {
                    this.log.LE(error);
                    this.RtcSetSignalingFailed("Failed to set the answer as local description.");
                });
                
            });
            createAnswerPromise.catch( (error: any) => {
                this.log.LE(error);
                this.RtcSetSignalingFailed("Failed to create an answer.");
            });
            
        });
        remoteDescPromise.catch((error: any) => {
            this.log.LE(error);
            this.RtcSetSignalingFailed("Failed to set the offer as remote description.");
        });
    }


    private RecAnswer(answer: RTCSessionDescription): void {
        if(this.DEBUG)
            this.log.LW("RecAnswer");
        answer = this.ProcessRemoteSdp(answer);
        let remoteDescPromise = this.mPeer.setRemoteDescription(answer);
        remoteDescPromise.then(() => {
            //all done
            this.StartIce();
        });
        remoteDescPromise.catch((error: any) => {
            this.log.LE(error);
            this.RtcSetSignalingFailed("Failed to set the answer as remote description.");
        });
        
    }

    private RtcSetSignalingStarted(): void {
        if (this.mRtcInternalState == WebRtcInternalState.None) {
            this.mRtcInternalState = WebRtcInternalState.Signaling;
        }
    }
    protected RtcSetSignalingFailed(reason: string): void {
        this.log.L("Signaling failed: " + reason);
        this.mRtcInternalState = WebRtcInternalState.SignalingFailed;
    }

    protected RtcSetConnected(): void {
        if (this.mRtcInternalState == WebRtcInternalState.Signaling)
            this.mRtcInternalState = WebRtcInternalState.Connected;
    }
    /**Called if a WebRTC side event leads to this peer closing
     * e.g. ice failed, data channel suddenly closed
     * This must not be an error. It might just be the remote side ending the call
     * which will usually result in the data channels closing.
     * @param reason Additional information for logging
     */
    protected RtcSetClosed(reason: string): void {
        if (this.mRtcInternalState == WebRtcInternalState.Connected)
        {
            if (this.mState !== WebRtcPeerState.Closed
                && this.mState !== WebRtcPeerState.Closing) {
                    this.log.L("WebRTC side event triggered closure. Reason: " + reason);
            }
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

    /*
    private OnIceConnectionStateChange = (ev: Event): void =>
    {
        this.log.LW("oniceconnectionstatechange: " + this.mPeer.iceConnectionState);
        //Chrome stopped emitting "failed" events. We have to react to disconnected events now
        if (this.mPeer.iceConnectionState == "failed" || this.mPeer.iceConnectionState == "disconnected")
        {
            if(this.mState == WebRtcPeerState.Signaling)
            {
                this.RtcSetSignalingFailed();
            }else if(this.mState == WebRtcPeerState.Connected)
            {
                this.RtcSetClosed("ice connection state changed to " + this.mPeer.iceConnectionState);
            }
        }
    }
    */
    
    //this replaces IceConnectionStateChange
    //It works the same between chrome and firefox if adapter.js is used 
    private OnConnectionStateChange = (ev:Event): void =>
    {
        if (this.DEBUG)
            this.log.LW("onconnectionstatechange: " + this.mPeer.connectionState);
        if (this.mPeer.connectionState === 'failed') {
            
            
            if (this.USE_ICE_RESTART && this.mRetries < this.MAX_RETRIES)
            {
                //retry to connect
                this.mRetries++;
                if (this.mIsOfferer)
                {
                    if(this.DEBUG)
                        this.log.LW("Try to reconnect. Attempt " + (this.mRetries));
                    this.RestartIce();
                } else {
                    if(this.DEBUG)
                        this.log.LW("Wait for reconnect");// Attempt " + (this.mRetries));
                }
            } else {
                if (this.mRetries >= this.MAX_RETRIES) {
                    this.log.LW("Shutting down peer. IceRestart failed " + (this.mRetries) + "times");
                }
                if(this.mState == WebRtcPeerState.Signaling)
                {
                    //never had a connection established
                    this.RtcSetSignalingFailed("connectionState switched to failed");
                }else if(this.mState == WebRtcPeerState.Connected)
                {
                    //connection was established and failed
                    this.RtcSetClosed("ice connection state changed to " + this.mPeer.iceConnectionState);
                }
            }
        } else if (this.mPeer.connectionState === "connected") {
            this.mRetries = 0;
            if (this.RENEGOTATE_ROLES)
            {
                //switch mUseRoleNegotiation back on for the next negotiation attempt
                this.mUseRoleNegotiation = true;
            }
        }
    }

    private TriggerRestartIce() {
        this.mPeer.restartIce();
        this.log.LW("restartIce + starting signaling");
        this.StartSignalingInternal();
    }

    private RestartIce() {
        
        this.TriggerRestartIce();
        
        /*
        if (this.mReconnectInterval === null) {
            //retry immediately on the first call
            this.TriggerRestartIce();
            //then repeat every 15 sec (and ignore any other calls to RestartIce)
            this.log.LW("starting reconnect interval.");
            this.mReconnectInterval = setInterval(() => {
                if (this.mPeer.connectionState === "connected") {
                    this.log.LW("reconnect worked.");
                    clearInterval(this.mReconnectInterval);
                    this.mReconnectInterval = null;
                } else {
                    this.log.LW("restart ice has not reconnected the peers yet. Retrying ...");
                    this.TriggerRestartIce();
                }
            }, 15000);
        }
            */
    }


    private OnIceGatheringStateChange = (ev:Event): void =>
    {
        if(this.DEBUG)
            this.log.L("onicegatheringstatechange: " + this.mPeer.iceGatheringState);
    }

    private OnNegotiationNeeded = (ev:Event): void =>
    {
        //we ignore OnNegotiationNeeded during the first trigger when the peer isn't connected yet
        //(handled separately)
        if (this.mState == WebRtcPeerState.Connected)
        {
            //if the peer is configured for single negotiation we skip this event
            //it likely indicates an error as this should never happen
            if (this.SINGLE_NEGOTIATION) {
                this.log.LW("OnNegotiationNeeded: ignored because the peer is configured for single negotiation."
                    + " This can indicate the peer is configured incorrectly and media will not be sent.");
            } else if (this.RENEGOTATE_ROLES) {
                this.log.L("OnNegotiationNeeded: renegotiating signaling roles");
                this.NegotiateSignaling();
            } else {
                //user triggered Configure
                this.log.L("starting signaling due to OnNegotiationNeeded and RENEGOTATE_ROLES=false");
                this.StartSignalingInternal();
            }
        }
        
    }

    //broken in chrome. won't switch to closed anymore
    private OnSignalingChange = (ev:Event): void =>
    {
        if(this.DEBUG)
            this.log.LW("onsignalingstatechange:" + this.mPeer.signalingState);
        //obsolete
        if (this.mPeer.signalingState == "closed") {
            this.RtcSetClosed("signaling state changed to " + this.mPeer.signalingState);
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
    private mRtcEvents: Queue<RtcEvent> = new Queue<RtcEvent>();


    private static sLabelReliable: string = "reliable";
    private static sLabelUnreliable: string = "unreliable";
    private mReliableDataChannelReady: boolean = false;
    private mUnreliableDataChannelReady: boolean = false;

    private mReliableDataChannel: RTCDataChannel = null;
    private mUnreliableDataChannel: RTCDataChannel = null;


    public constructor(id: ConnectionId, peerConfig: PeerConfig, baseLogger: SLogger) {
        super(peerConfig, baseLogger);
        this.mConnectionId = id;
    }

    protected OnSetup():void {
        this.mPeer.ondatachannel = (ev: Event) => { this.OnDataChannel((ev as any).channel); };
    }

    //Triggers if this peer starts the signaling. Not triggered on answer side
    //TODO: better renamed to OnBeforeOffer?
    protected OnStartSignaling(): void {

        if (this.mReliableDataChannel === null) {
            let configReliable: RTCDataChannelInit = {} as RTCDataChannelInit;
            this.mReliableDataChannel = this.mPeer.createDataChannel(WebRtcDataPeer.sLabelReliable, configReliable);
            this.RegisterObserverReliable();
        }

        if (this.mUnreliableDataChannel === null) {
            let configUnreliable: RTCDataChannelInit = {} as RTCDataChannelInit;
            configUnreliable.maxRetransmits = 0;
            configUnreliable.ordered = false;
            this.mUnreliableDataChannel = this.mPeer.createDataChannel(WebRtcDataPeer.sLabelUnreliable, configUnreliable);
            this.RegisterObserverUnreliable();
        }

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
            this.log.LE("Exception while trying to send: " + e);
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
            this.log.LE("Exception while trying to access GetBufferedAmount: " + e);
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
            this.log.LE("Datachannel with unexpected label " + newChannel.label);
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
            this.log.LE("Invalid message type. Only blob and arraybuffer supported: " + event.data);
        }
    }


    private ReliableDataChannel_OnMessage(event: MessageEvent): void {
        this.log.L("ReliableDataChannel_OnMessage ");
        this.RtcOnMessageReceived(event, true);
    }

    private ReliableDataChannel_OnOpen(): void {
        if(this.DEBUG)
            this.log.LW("mReliableDataChannelReady");
        this.mReliableDataChannelReady = true;
        if (this.IsRtcConnected()) {
            this.RtcSetConnected();
            this.log.L("Fully connected");
        }
    }

    private ReliableDataChannel_OnClose(): void {
        let msg = "reliable data channel closed";
        if (this.USE_ICE_RESTART && this.USE_ICE_RESTART_DC_WORKAROUND && this.MAX_RETRIES > 0
            && this.GetState() == WebRtcPeerState.Connected) {
            //note this warning can often be ignored: If this is a planned shutdown whole peer
            //will be closed and the shutdown is correct processed even when ignoring this event.
            //only if ice restart is attempted this warning indicates that while the connection
            //recovers out data channels did not (only happens with firefox)
            this.log.LW("ICE_RESTART_DC_WORKAROUND: Ignoring data channel closure. " + msg);
            return;
        }
        this.RtcSetClosed(msg);
    }

    private ReliableDataChannel_OnError(error: any) : void
    {
        let err = "reliable data channel error: " + JSON.stringify(error);
        this.log.LE(err);
        this.RtcSetClosed(err);
    }

    private UnreliableDataChannel_OnMessage(event: MessageEvent): void {
        this.log.L("UnreliableDataChannel_OnMessage ");
        this.RtcOnMessageReceived(event, false);
    }

    private UnreliableDataChannel_OnOpen(): void {
        if(this.DEBUG)
            this.log.LW("mUnreliableDataChannelReady");
        this.mUnreliableDataChannelReady = true;
        if (this.IsRtcConnected()) {
            this.RtcSetConnected();
            this.log.L("Fully connected");
        }
    }

    private UnreliableDataChannel_OnClose(): void {
        let msg = "unreliable data channel closed";
        if (this.USE_ICE_RESTART && this.USE_ICE_RESTART_DC_WORKAROUND && this.MAX_RETRIES > 0
            && this.GetState() == WebRtcPeerState.Connected) {
            //note this warning can often be ignored: If this is a planned shutdown whole peer
            //will be closed and the shutdown is correct processed even when ignoring this event.
            //only if ice restart is attempted this warning indicates that while the connection
            //recovers out data channels did not (only happens with firefox)
            this.log.LW("ICE_RESTART_DC_WORKAROUND: Ignoring data channel closure. " + msg);
            return;
        }
        this.RtcSetClosed(msg);
    }

    private UnreliableDataChannel_OnError(error: any): void {
        let err = "reliable data channel error: " + JSON.stringify(error);
        this.log.LE(err);
        this.RtcSetClosed(err);
    }

    private IsRtcConnected(): boolean {
        return this.mReliableDataChannelReady && this.mUnreliableDataChannelReady;
    }


    public RequestStats(): void {
        setTimeout(async () => { 
            
            const all = await this.mPeer.getStats(null) as AnyRTCStatsReport;
            const reports = Array.from(all.values());
            var evt = new StatsEvent(this.mConnectionId, reports as RTCStatsReport[]);
            this.mRtcEvents.Enqueue(evt);

        }, 0);
    }

    public DequeueRtcEvent(): RtcEvent{
        return this.mRtcEvents.Dequeue();
    }

}