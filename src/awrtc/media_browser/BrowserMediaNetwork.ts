﻿/*
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
import { WebRtcNetwork, SLog, ConnectionId, WebRtcDataPeer, Queue, PeerConfig, SLogger }
    from "../network/index";
import { IMediaNetwork, MediaConfigurationState, StreamAddedEvent } from "../media/IMediaNetwork";
import { NetworkConfig } from "../network/NetworkConfig";
import { MediaConfig } from "../media/MediaConfig";
import { IFrameData } from "../media/RawFrame";
import { MediaPeer } from "./MediaPeer";
import { BrowserMediaStream } from "./BrowserMediaStream";
import { DeviceApi } from "./DeviceApi";
import { Media } from "./Media";


/**Avoid using this class directly whenever possible. Use BrowserWebRtcCall instead. 
 * BrowserMediaNetwork might be subject to frequent changes to keep up with changes
 * in all other platforms.  
 * 
 * IMediaNetwork implementation for the browser. The class is mostly identical with the
 * C# version. Main goal is to have an interface that can easily be wrapped to other
 * programming languages and gives access to basic WebRTC features such as receiving
 * and sending audio and video + signaling via websockets. 
 * 
 * BrowserMediaNetwork can be used to stream a local audio and video track to a group of 
 * multiple peers and receive remote tracks. The handling of the peers itself
 * remains the same as WebRtcNetwork.
 * Local tracks are created after calling Configure. This will request access from the
 * user. After the user allowed access GetConfigurationState will return Configured.
 * Every incoming and outgoing peer that is established after this will receive
 * the local audio and video track. 
 * So far Configure can only be called once before any peers are connected.
 * 
 * 
 */
export class BrowserMediaNetwork extends WebRtcNetwork implements IMediaNetwork {
    private mMediaConfig: MediaConfig = new MediaConfig();
    //keeps track of audio / video tracks based on local devices
    //will be shared with all connected peers.
    private mLocalStream: BrowserMediaStream = null;
    private mConfigurationState: MediaConfigurationState = MediaConfigurationState.Invalid;
    private mConfigurationError: string = null;
    


    constructor(config: NetworkConfig) {
        super(config);
        this.log = new SLogger("MediaNetwork" + this.mId);
        this.mConfigurationState = MediaConfigurationState.NoConfiguration;
    }

    /** Returns MediaStream or fails with exception
     * 
     */
    private async GetMedia(config: MediaConfig): Promise<MediaStream>{ 
        if(DeviceApi.IsUserMediaAvailable() == false){
            let error = "Configuration failed. navigator.mediaDevices is undefined. The browser might not allow media access." +
            "Is the page loaded via http or file URL? Some browsers only support media access via https!";
            throw error;
        }
        
        let stream = await Media.SharedInstance.getUserMedia(config);
        return stream;
    }

    /**Triggers the creation of a local audio and video track. After this
     * call the user might get a request to allow access to the requested 
     * devices.
     * 
     * @param config Detail configuration for audio/video devices.
     */
    public Configure(config: MediaConfig): void {

        if (this.mIsDisposed) {
            this.OnConfigurationFailed("Network has been disposed.");
            return;
        }

        this.mMediaConfig = config;
        this.mConfigurationError = null;
        this.mConfigurationState = MediaConfigurationState.InProgress;

        
        if (this.mLocalStream !== null) {
            this.mLocalStream.Dispose();
            this.mLocalStream = null;
        }


        if (config.Audio || config.Video) {
            SLog.L("calling GetUserMedia. Media config: " + JSON.stringify(config));

            setTimeout(async ()=>{
                try
                {
                    let stream = await this.GetMedia(config);
                    if(this.mIsDisposed)
                        return;
                    this.mLocalStream = new BrowserMediaStream(true, this.log);
                    stream.getTracks().forEach((x) => { this.mLocalStream.UpdateTrack(x);});
                    //ensure local audio is not replayed
                    this.mLocalStream.SetMute(true);
                    this.OnLocalStreamUpdated();
                    this.OnConfigurationSuccess();
                }catch(error){
                    this.OnConfigurationFailed("Accessing media failed due to exception: " + error);
                }
            }, 0);
        } else {
            this.OnLocalStreamUpdated();
            this.OnConfigurationSuccess();
        }
    }

    private OnLocalStreamUpdated() {

        //update all peers on the change
        Object.values(this.IdToConnection).forEach(x => (x as MediaPeer).SetLocalStream(this.mLocalStream, this.mMediaConfig));

        //set event handler to trigger once all meta data & video element is available
        if (this.mLocalStream != null)
        {
            this.mLocalStream.InternalStreamAdded = (stream)=>{
                this.EnqueueRtcEvent(new StreamAddedEvent(ConnectionId.INVALID, this.mLocalStream.VideoElement));
            };
        }
    }
    
    
    /**Call this every time a new frame is shown to the user in realtime
     * applications.
     * 
     */
    public Update(): void {
        super.Update();

        if (this.mLocalStream != null)
            this.mLocalStream.Update();
    }

    /**
     * Call this every frame after interacting with this instance.
     * 
     * This call might flush buffered messages in the future and clear
     * events that the user didn't process to avoid buffer overflows.
     * 
     */
    public Flush():void{
        super.Flush();
    }

    /**Poll this after Configure is called to get the result.
     * Won't change after state is Configured or Failed.
     * 
     */
    public GetConfigurationState(): MediaConfigurationState {
        return this.mConfigurationState;
    }

    /**Returns the error message if the configure process failed.
     * This usally either happens because the user refused access
     * or no device fulfills the configuration given 
     * (e.g. device doesn't support the given resolution)
     * 
     */
    public GetConfigurationError(): string {
        return this.mConfigurationError;
    }

    /**Resets the configuration state to allow multiple attempts
     * to call Configure. 
     * 
     */
    public ResetConfiguration(): void {
        this.mConfigurationState = MediaConfigurationState.NoConfiguration;
        this.mMediaConfig = new MediaConfig();
        this.mConfigurationError = null;
    }
    private OnConfigurationSuccess(): void {
        this.mConfigurationState = MediaConfigurationState.Successful;
    }

    private OnConfigurationFailed(error: string): void {
        this.mConfigurationError = error;
        this.mConfigurationState = MediaConfigurationState.Failed;
    }

    /**Allows to peek at the current frame.
     * Added to allow the emscripten C / C# side to allocate memory before
     * actually getting the frame.
     * 
     * @param id 
     */
    public PeekFrame(id: ConnectionId): IFrameData {

        if (id == null)
            return;

        if (id.id == ConnectionId.INVALID.id) {
            if (this.mLocalStream != null) {
                return this.mLocalStream.PeekFrame();
            }
        } else {
            let peer = this.IdToConnection[id.id] as MediaPeer;
            if (peer != null) {
                return peer.PeekFrame();
            }
            //TODO: iterate over media peers and do the same as above
        }

        return null;
    }
    public TryGetFrame(id: ConnectionId): IFrameData {

        if (id == null)
            return;

        if (id.id == ConnectionId.INVALID.id) {
            if (this.mLocalStream != null) {
                return this.mLocalStream.TryGetFrame();
            }
        } else {
            let peer = this.IdToConnection[id.id] as MediaPeer;
            if (peer != null) {
                return peer.TryGetRemoteFrame();
            }
            //TODO: iterate over media peers and do the same as above
        }

        return null;
    }

    /**
     * Remote audio control for each peer. 
     * 
     * @param volume 0 - mute and 1 - max volume
     * @param id peer id
     */
    public SetVolume(volume: number, id: ConnectionId): void {

        SLog.L("SetVolume called. Volume: " + volume + " id: " + id.id);
        let peer = this.IdToConnection[id.id] as MediaPeer;
        if (peer != null) {
            return peer.SetVolume(volume);
        }
    }

    public SetVolumePan(volume: number, pan: number, id: ConnectionId): void {

        SLog.L("SetVolumePan called. Volume: " + volume + "pan: " + pan + " id: " + id.id);
        let peer = this.IdToConnection[id.id] as MediaPeer;
        if (peer != null) {
            return peer.SetVolumePan(volume, pan);
        }
    }
    
    /** Allows to check if a specific peer has a remote
     * audio track attached. 
     * 
     * @param id 
     */
    public HasAudioTrack(id: ConnectionId): boolean {
        let peer = this.IdToConnection[id.id] as MediaPeer;
        if (peer != null) {
            return peer.HasAudioTrack();
        }
        return false;
    }
    /** Allows to check if a specific peer has a remote
     * video track attached. 
     * 
     * @param id 
     */
    public HasVideoTrack(id: ConnectionId): boolean {
        let peer = this.IdToConnection[id.id] as MediaPeer;
        if (peer != null) {
            return peer.HasVideoTrack();
        }
        return false;
    }
    /**Returns true if no local audio available or it is muted. 
     * False if audio is available (could still not work due to 0 volume, hardware
     * volume control or a dummy audio input device is being used)
     */
    public IsMute(): boolean {

        if(this.mLocalStream != null && this.mLocalStream.Stream != null)
        {
            var stream = this.mLocalStream.Stream;
            var tracks = stream.getAudioTracks();
            if(tracks.length > 0)
            {
                if(tracks[0].enabled)
                    return false;
            }
        }
        return true;
    }

    /**Sets the local audio device to mute / unmute it.
     * 
     * @param value 
     */
    public SetMute(value: boolean){
        if(this.mLocalStream != null && this.mLocalStream.Stream != null)
        {
            var stream = this.mLocalStream.Stream;
            var tracks = stream.getAudioTracks();
            if(tracks.length > 0)
            {
                tracks[0].enabled = !value;
            }
        }
    }
    protected CreatePeer(peerId: ConnectionId): WebRtcDataPeer {

        const peerConfig = new PeerConfig(this.mNetConfig);
        let peer = new MediaPeer(peerId, peerConfig, this.mMediaConfig, this.log);
        peer.InternalStreamAdded = this.MediaPeer_InternalMediaStreamAdded;
        if (this.mLocalStream != null)
            setTimeout(async () => { 
                //SLog.L("Updating local stream");
                await peer.SetLocalStream(this.mLocalStream, this.mMediaConfig);
                this.log.L("Set local stream to new peer");
            });

        return peer;
    }

    private MediaPeer_InternalMediaStreamAdded = (peer: MediaPeer, stream:BrowserMediaStream):void =>
    {
        this.EnqueueRtcEvent(new StreamAddedEvent(peer.ConnectionId, stream.VideoElement));
    }

    protected DisposeInternal(): void
    {
        super.DisposeInternal();
        this.DisposeLocalStream();
    }

    private DisposeLocalStream(): void
    {
        if (this.mLocalStream != null) {
            this.mLocalStream.Dispose();
            this.mLocalStream = null;
        }
    }
    
}
