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
import { WebRtcDataPeer, SLog } from "../network/index";
import { BrowserMediaStream } from "./BrowserMediaStream";
import { IFrameData } from "../media/RawFrame";

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
    private mRemoteStream: BrowserMediaStream = null;
    //quick workaround to allow html user to get the HTMLVideoElement once it is
    //created. Might be done via events later to make wrapping to unity/emscripten possible
    public InternalStreamAdded: (peer:MediaPeer, stream: BrowserMediaStream) => void = null;
    
    //true - will use obsolete onstream / add stream
    //false - will use ontrack / addtrack (seems to work fine now even on chrome)
    public static sUseObsolete = false;

    
    protected OnSetup(): void {
        super.OnSetup();
        //TODO: test in different browsers if boolean works now
        //this is unclear in the API. according to typescript they are boolean, in native code they are int
        //and some browser failed in the past if boolean was used ... 
        this.mOfferOptions = { "offerToReceiveAudio": true, "offerToReceiveVideo": true };
        
        if(MediaPeer.sUseObsolete) {
            SLog.LW("Using obsolete onaddstream as not all browsers support ontrack");
            (this.mPeer as RTCPeerConnectionObsolete).onaddstream = (streamEvent: RTCMediaStreamEvent) => { this.OnAddStream(streamEvent); };
        }
        else{
            this.mPeer.ontrack = (ev:RTCTrackEvent)=>{this.OnTrack(ev);}
        }
    }
    protected OnCleanup() {
        super.OnCleanup();
        if (this.mRemoteStream != null) {
            this.mRemoteStream.Dispose();
            this.mRemoteStream = null;
        }
    }
    private OnAddStream(streamEvent: RTCMediaStreamEvent) {
        this.SetupStream(streamEvent.stream);
    }

    private OnTrack(ev:RTCTrackEvent){

        if(ev && ev.streams && ev.streams.length > 0)
        {
            //this is getting called twice if audio and video is active
            if(this.mRemoteStream == null)
                this.SetupStream(ev.streams[0]);
        }else{
            SLog.LE("Unexpected RTCTrackEvent: " + JSON.stringify(ev));
        }
    }

    private SetupStream(stream:MediaStream)
    {
        this.mRemoteStream = new BrowserMediaStream(stream);
        //trigger events once the stream has its meta data available
        this.mRemoteStream.InternalStreamAdded = (stream) =>{
            if(this.InternalStreamAdded != null)
            {
                this.InternalStreamAdded(this, stream);
            }
        };
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

    public AddLocalStream(stream: MediaStream) {

    
        if(MediaPeer.sUseObsolete) {
            (this.mPeer as RTCPeerConnectionObsolete).addStream(stream);
        }
        else{
            for(let v of stream.getTracks())
            {
                this.mPeer.addTrack(v, stream);
            }
        }

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
}