/*
Copyright (c) 2022, because-why-not.com Limited
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
import { WebRtcDataPeer, ConnectionId, PeerConfig, SLogger, SLog } from "../network/index";
import { BrowserMediaStream } from "./BrowserMediaStream";
import { IFrameData } from "../media/RawFrame";
import { MediaConfig } from "../media/MediaConfig";


//TODO: Not part of typescript as it is obsolete but
//chrome might still need this
export interface RTCMediaStreamEvent extends Event {
    stream: MediaStream;
}

export interface RTCPeerConnectionObsolete extends RTCPeerConnection
{
    onaddstream: ((this: RTCPeerConnection, streamEvent: RTCMediaStreamEvent) => any) | null;
    addStream(stream: MediaStream): void;
}


export class MediaPeer extends WebRtcDataPeer
{
    //TODO: Remove debug values and replace with MediaConfig
    private DEBUG_QUALITY = false;
    static MUNGE_SDP = false;
    protected DEBUG_preferredCodec = null;
    //if true it rewrites the profile id for iOS 4k
    private DEBUG_IosWorkaround = false;


    private mMediaConfig: MediaConfig;
    private mRemoteStream: BrowserMediaStream = null;
    private mAudioSender: RTCRtpSender = null;
    private mVideoSender: RTCRtpSender = null;

    //quick workaround to allow html user to get the HTMLVideoElement once it is
    //created. Might be done via events later to make wrapping to unity/emscripten possible
    public InternalStreamAdded: (peer:MediaPeer, stream: BrowserMediaStream) => void = null;
    
    

    public constructor(connectionId: ConnectionId, peerConfig:PeerConfig, mediaConfig:MediaConfig, baseLogger: SLogger) {
        super(connectionId, peerConfig, baseLogger);
        this.mMediaConfig = mediaConfig;
    }
    
    
    protected OnSetup(): void {
        super.OnSetup();
        this.mPeer.ontrack = (ev: RTCTrackEvent) => { this.OnTrack(ev); }
    }

    private getTransceiverByKind(kind){
        for(const tr of this.mPeer.getTransceivers())
        {
            if ((tr.receiver !== null && tr.receiver.track !== null && tr.receiver.track.kind == kind)
                || (tr.sender !== null && tr.sender.track !== null && tr.sender.track.kind == kind)) {
                return tr;
            }
        }
        return null;
    }

    
    private static ReorderList(lst: RTCRtpCodecCapability[], mimeTypes: string[]): RTCRtpCodecCapability[] {
        // Sort the list based on priorities
        lst.sort((a, b) => {
            //get the index for each codec
            const indexA = mimeTypes.findIndex(mimeType => a.mimeType.includes(mimeType));
            const indexB = mimeTypes.findIndex(mimeType => b.mimeType.includes(mimeType));
    
            //use the index as priority. if the index is not found we use the lowest priority (length of the array)
            const priorityA = indexA === -1 ? mimeTypes.length : indexA;
            const priorityB = indexB === -1 ? mimeTypes.length : indexB;
    
            return priorityA - priorityB;
        });
    
        return lst;
    }
    /*
    private static ReorderList(lst: RTCRtpCodecCapability[], mimeType: string) {
        const containsKeyword = lst.filter(item => item.mimeType.includes(mimeType));
        const doesNotContainKeyword = lst.filter(item => !item.mimeType.includes(mimeType));
        return containsKeyword.concat(doesNotContainKeyword);
    }*/
    /**Called when the transceiver for video is first accessed
     * 
     * TODO: Watch out when implementing codecs. If the old 
     * offerToReceive option is used this is only called after
     * createOffer/createAnswer. Likely too late to change the codec order
     * 
     * @param sender 
     * @returns 
     */
    async SetVideoParams(sender: RTCRtpSender) {
        if (!sender || !sender.track) return;

        if (this.mMediaConfig.VideoBitrateKbits) {
            try {
                //Added verbose warnings here because Safari & mobile browsers appear to
                //return some unusual values
                const params = sender.getParameters();
                if (!params) {
                    this.log.LW("Unable to call VideoBitrateKbits. getParameters returned null");
                }
                if (!params.encodings) {
                    this.log.LW("encodings was undefined. VideoBitrateKbits ignored.");
                    return;
                }
                if (Array.isArray(params.encodings) === false) {
                    this.log.LW("encodings was not an array. Setting VideoBitrateKbits ignored");
                    return;
                }
                if (params.encodings.length === 0) {
                    this.log.LW("encodings was empty. Setting VideoBitrateKbits ignored");
                    return;
                }
                params.encodings[0].maxBitrate = this.mMediaConfig.VideoBitrateKbits * 1000;
                await sender.setParameters(params);
            } catch (err) {
                this.log.LE("Setting VideoBitrateKbits failed with exception:");
                this.log.LE(err);
            }
        }
    }

    setVideoTransceiver(transceiver: RTCRtpTransceiver) {
        if (this.mMediaConfig && this.mMediaConfig.VideoCodecs && this.mMediaConfig.VideoCodecs.length > 0) {
            const codecList = RTCRtpReceiver.getCapabilities("video").codecs;
            //this.log.L(JSON.stringify(codecList));
            const newCodecList = MediaPeer.ReorderList(codecList, this.mMediaConfig.VideoCodecs);
            if (transceiver.setCodecPreferences)
            {
                transceiver.setCodecPreferences(newCodecList);
            } else {
                this.log.LW("Unable to call setCodecPreferences. Default codecs will be used.");
            }
        }
    }
    
    
    protected override async CreateOfferImpl(): Promise<RTCSessionDescriptionInit> {
        if (this.SINGLE_NEGOTIATION) {
            //if we haven't added a transceiver yet we do it here
            //this is roughly the same as this.mPeer.createOffer(offerOptions);
            //except we always set the direction to "sendrecv".
            //This causes the browser to create inactive dummy tracks until we
            //replace them with our own later
            
            if (this.getTransceiverByKind("audio") == null)
            {
                this.log.L("Add transceiver for audio");
                let atransceiver = this.mPeer.addTransceiver("audio", { direction: "sendrecv" });
                this.mAudioSender = atransceiver.sender;
                //this.mAudioSender.setStreams(this.mMediaStream);
            }
            
            if (this.getTransceiverByKind("video") == null) {
                this.log.L("Add transceiver for video");
                let vtransceiver = this.mPeer.addTransceiver("video", { direction: "sendrecv" });
                this.setVideoTransceiver(vtransceiver);
                this.mVideoSender = vtransceiver.sender;
                await this.SetVideoParams(this.mVideoSender);
                

                //this.mVideoSender.setStreams(this.mMediaStream);
            }
            return this.mPeer.createOffer();
        } else {

            const useNew = true;
            if (useNew) {
                //todo: we have to change the direction depending on what local tracks we have
                let atransceiver = this.getTransceiverByKind("audio");
                if (atransceiver == null)
                {
                    this.log.L("Add transceiver for audio");
                    atransceiver = this.mPeer.addTransceiver("audio", { direction: "recvonly" });
                    this.mAudioSender = atransceiver.sender;
                }
                
                let vtransceiver = this.getTransceiverByKind("video");
                if (vtransceiver == null) {
                    //if we don't have a transceiver yet (not sending video) create one
                    this.log.L("Add transceiver for video");
                    vtransceiver = this.mPeer.addTransceiver("video", { direction: "recvonly" });
                }
                this.setVideoTransceiver(vtransceiver);
                this.mVideoSender = vtransceiver.sender;
                await this.SetVideoParams(this.mVideoSender);
                
                const offer = await this.mPeer.createOffer();
                return offer;
            } else {
                
                //TODO: This system is weird. We let the receiver decide the priority?
                //if we uncomment this on the offerer side the answerer will send VP8
                const vtransceiver = this.getTransceiverByKind("video") 
                if (vtransceiver != null) {
                    this.setVideoTransceiver(vtransceiver);
                } else {
                    console.warn("No transceiver found. ");
                }
                //we keep this backwards compatible for now for simplicity
                //this should create 2 transceivers if not yet created and set them to reconly
                //otherwise addTrack created them already and they are set to sendrecv
                const offerOptions = { "offerToReceiveAudio": true, "offerToReceiveVideo": true };
                const offer = await this.mPeer.createOffer(offerOptions);
                
                
                
                //this.setVideoTransceiver(vtransceiver);
                if (vtransceiver !== null) {
                    this.mVideoSender = vtransceiver.sender;
                    await this.SetVideoParams(this.mVideoSender);
                }
                return offer;
            }
            
        }
    }

    protected override async CreateAnswerImpl(): Promise<RTCSessionDescriptionInit> {
        if (this.SINGLE_NEGOTIATION) {
            //if addTrack or replaceTrack were not used to attach a track we must make sure we 
            //manually set the direction to sendrecv & buffer the senders to reuse later. 
            //Otherwise future changes will trigger renegotiation
            const atransceiver = this.getTransceiverByKind("audio");
            if (atransceiver !== null) {
                atransceiver.direction = "sendrecv";
                this.mAudioSender = atransceiver.sender;
            }
            const vtransceiver = this.getTransceiverByKind("video");
            if (vtransceiver !== null) {
                vtransceiver.direction = "sendrecv";
                this.setVideoTransceiver(vtransceiver);
                this.mVideoSender = vtransceiver.sender;
                await this.SetVideoParams(this.mVideoSender);
            }
        } else {
            
            
            //get the created sender and apply settings
            const vtransceiver = this.getTransceiverByKind("video");
            if (vtransceiver !== null) {
                this.setVideoTransceiver(vtransceiver);
                this.mVideoSender = vtransceiver.sender;
                await this.SetVideoParams(this.mVideoSender);
            }
        }
        return this.mPeer.createAnswer();
    }
    

    protected OnCleanup() {
        super.OnCleanup();
        if (this.mRemoteStream != null) {
            this.mRemoteStream.Dispose();
            this.mRemoteStream = null;
        }
    }

    private OnTrack(ev: RTCTrackEvent)
    {
        //we stop relying on streams altogether now
        this.log.L("ontrack: " + ev.track.kind);
        this.UpdateRemoteStream(ev.track);
    }

    private UpdateRemoteStream(track:MediaStreamTrack)
    {
        if (this.mRemoteStream == null)
        {
            this.mRemoteStream = new BrowserMediaStream(false, this.log);
            
            //trigger events once the stream has its meta data available
            this.mRemoteStream.InternalStreamAdded = (stream) =>{
                if(this.InternalStreamAdded != null)
                {
                    this.InternalStreamAdded(this, stream);
                }
            };
        }
        if (this.SINGLE_NEGOTIATION === false)
        {
            //just add the track to the existing stream
            //HTMLVideoElement should be able to handle this
            this.mRemoteStream.UpdateTrack(track);
        } else {
            //workaround 1:
            //If we connect a new Peer with video disabled it will already contain a video track
            //If we add this track immediately then HTMLVideoElement does not playback audio until
            //the video is being activated (which might never happen).
            //To ensure audio can play without video we only add tracks once they become active (onunmute) event

            //Workaround 2:
            //Chrome incorrectly (?) treats the inactive video track as "unmuted" at first
            //but triggers the correct "muted" event roughly 1 second later
            //Thus we add the track first, then remove the track again once the mute event triggers,
            //then we have to reset the video element to ensure audio can start playing without the video track

            //Note these workaround currently depend on the audio track arriving first

            //TODO: These workarounds only work on Firefox and Chrome. Safari shows the track as unmuted and never triggers
            //a mute event. Audio is not played back
            this.log.L("delaying track of type: " + track.kind + " muted?" + track.muted + " enabled?" + track.enabled);
            track.onunmute = () => { 
                this.log.L("adding unmuted track of type: " + track.kind);
                this.mRemoteStream.UpdateTrack(track);
            }
            track.onmute = () => { 
                this.log.L("removing muted track of type: " + track.kind);
                this.mRemoteStream.Stream.removeTrack(track);
                //this resets the HTMLVideoElemt.srcObject and triggers the stream to reload again without
                //the track
                this.mRemoteStream.ResetObject();
            }
        }
    }

    public TryGetRemoteFrame(): IFrameData
    {
        if (this.mRemoteStream == null)
            return null;
        return this.mRemoteStream.TryGetFrame();
    }

    public PeekFrame(): IFrameData {
        if (this.mRemoteStream == null)
            return null;
        return this.mRemoteStream.PeekFrame();
    }

    public async SetLocalStream(stream_container: BrowserMediaStream, config: MediaConfig): Promise<void> {
        this.mMediaConfig = config;
        let atrack:MediaStreamTrack = null;
        let vtrack:MediaStreamTrack = null;
        if (stream_container !== null) {
            atrack = stream_container.GetAudioTrack();
            vtrack = stream_container.GetVideoTrack();
            if(this.mMediaConfig.VideoContentHint)
                vtrack.contentHint = this.mMediaConfig.VideoContentHint;
        }

        //TODO: Fully upgrade the transceiver API once firefox supports
        //setStreams .

        if (atrack != null) {
            if (this.mAudioSender != null) {
                //this.mAudioSender.setStreams(stream_container.Stream);
                try{
                    await this.mAudioSender.replaceTrack(atrack);
                    const atransceiver = this.getTransceiverByKind("audio")
                    if (atransceiver) {
                        if (atransceiver.currentDirection != "sendrecv") {
                            atransceiver.direction = "sendrecv";
                        }
                    } else {
                        this.log.LW("Unable to find the audio transceiver to attach a new track. This indicates the peer is incorrectly configured.");
                    }
                } catch (err) {
                    this.log.LE("Error during replaceTrack: " + err);
                }
            } else {
                //no sender yet but a track is suppose to be attached -> create one
                //this does create a transceiver set to "sendrecv"
                this.log.L("addinging track of type " + atrack.kind);
                //ensure stream is attached as older builds depend on this
                this.mAudioSender = this.mPeer.addTrack(atrack, stream_container.Stream);
            }
        } else {
            //no audio track. Make sure if we have a sender no tracks are attached
            if (this.mAudioSender != null && this.mAudioSender.track !== null) {
                this.log.L("setting track of type audio to null");
                //wait for firefox support of setStreams
                //this.mAudioSender.setStreams(stream_container.Stream);
                await this.mAudioSender.replaceTrack(null);
            }
        }

        

        if (vtrack != null) {
            if (this.mVideoSender != null) {
                //this.mVideoSender.setStreams(stream_container.Stream);
                try {
                    await this.mVideoSender.replaceTrack(vtrack);
                    
                    const vtransceiver = this.getTransceiverByKind("video")
                    if (vtransceiver) {
                        if(vtransceiver.currentDirection != "sendrecv")
                            vtransceiver.direction = "sendrecv";
                    } else {
                        SLog.LW("Unable to find the video transceiver to attach a new track. This indicates the peer is incorrectly configured.");
                    }
                } catch (err) {
                    this.log.LE("Error during replaceTrack: " + err);
                }
            } else {
                //no sender yet but a track is suppose to be attached -> create one
                //this does create a transceiver set to "sendrecv"
                this.log.L("addinging track of type " + vtrack.kind);
                //ensure stream is attached as older builds depend on this
                this.mVideoSender = this.mPeer.addTrack(vtrack, stream_container.Stream);
                if (this.DEBUG_QUALITY)
                {
                    let codec_mimeType = "unknown";
                    let codecId = "unknown";
                    setInterval(async () => {
                        const all = await this.mPeer.getStats(null);
                        console.debug("all:")
                        console.debug(Array.from((all as any).values()))

                        all.forEach((report) => {


                            if ( report.kind === "video" && report.type === "outbound-rtp") {
                                console.log(report.type + " " + report.frameWidth + "x" + report.frameHeight
                                    + " FPS:" + report.framesPerSecond
                                    + " qual:" + JSON.stringify(report.qualityLimitationDurations)
                                    + " codec:" + codec_mimeType
                                    + " offer: " + this.mIsOfferer);
                                codecId = report.codecId;
                            } else if (report.type === "codec" && report.id == codecId) {
                                //the actual codec mime type is returned via a different stats event
                                //store the id for our next regular log output
                                codec_mimeType = report.mimeType;
                            }
                          });
                    }, 1000);
                }

            }
        } else {
            //no video track. Make sure if we have a sender no old tracks are still attached
            if (this.mVideoSender != null && this.mVideoSender.track !== null) {
                this.log.L("setting track of type video to null");
                //wait for firefox support of setStreams
                //this.mVideoSender.setStreams(stream_container.Stream);
                await this.mVideoSender.replaceTrack(null);
            }
        }
        if(this.DEBUG)
            console.warn("SetLocalStream completed: ", this.mPeer.getTransceivers());
    }

    public Update() {
        super.Update();

        if (this.mRemoteStream != null) {
            this.mRemoteStream.Update();
        }
    }

    public SetVolume(volume: number): void {
        if (this.mRemoteStream != null)
            this.mRemoteStream.SetVolume(volume);
    }
    public SetVolumePan(volume: number, pan: number): void {
        if (this.mRemoteStream != null)
            this.mRemoteStream.SetVolumePan(volume, pan);
    }

    public HasAudioTrack(): boolean {
        if (this.mRemoteStream != null)
            return this.mRemoteStream.HasAudioTrack();
        return false;
    }
    public HasVideoTrack(): boolean {
        if (this.mRemoteStream != null)
            return this.mRemoteStream.HasVideoTrack();
        return false;
    }




    
    //Gives a specific codec priority over the others
    private EditCodecs(lines: string[]){

        this.log.LW("sdp munging: prioritizing codec " + this.DEBUG_preferredCodec );

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
                    if(codecName === this.DEBUG_preferredCodec ){
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
    

    //for filtering out features. 
    private FilterFeatures(lines: string[]): string[] {
        
        lines = lines.filter((value, index) => { 
            const res = !value.includes("goog-remb");
            if (res == false) {
                console.log("dropping " + value);
            }
            return res;
        });
        return lines;
    }


    protected override ProcessLocalSdp(desc: RTCSessionDescription) :RTCSessionDescription {
        if(MediaPeer.MUNGE_SDP === false)
            return desc

        console.warn("sdp munging active");
        let sdp_in = desc.sdp;
        let sdp_out = "";
        let lines = sdp_in.split("\r\n");

        if(this.DEBUG_preferredCodec)
            this.EditCodecs(lines);
        
        //this.EditProfileLevel(lines);
        //lines = this.FilterFeatures(lines);
        if (this.DEBUG_IosWorkaround) {
            
            for (let i = 0; i < lines.length; i++){
                //browsers always use 1f even if they support higher res
                //iOs breaks if 1f is used but resolution is higher
                lines[i] = lines[i].replace("42e01f", "42e034");
            }
        }

        sdp_out = lines.join("\r\n");
        let desc_out = {type: desc.type, sdp: sdp_out} as RTCSessionDescription;
        return desc_out;
    }
    protected override ProcessRemoteSdp(desc: RTCSessionDescription) : RTCSessionDescription{
        if(MediaPeer.MUNGE_SDP === false)
            return desc;
        console.warn("sdp munging active");
        let sdp_in = desc.sdp;
        let sdp_out = "";
        let lines = sdp_in.split("\r\n");

        if(this.DEBUG_preferredCodec)
            this.EditCodecs(lines);
        
        if (this.DEBUG_IosWorkaround) {
            
            for (let i = 0; i < lines.length; i++) {
                //browsers always use 1f even if they support higher res
                //iOS breaks if 1f is used but resolution is higher
                lines[i] = lines[i].replace("42e034", "42e01f");
            }
        }
        //lines = this.FilterFeatures(lines);
        
        

        sdp_out = lines.join("\r\n");
        let desc_out = {type: desc.type, sdp: sdp_out} as RTCSessionDescription;

        return desc_out;
    }
    
}