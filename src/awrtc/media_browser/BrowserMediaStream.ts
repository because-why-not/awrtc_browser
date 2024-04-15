/*
Copyright (c) 2024, because-why-not.com Limited
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
import { IFrameData, RawFrame, LazyFrame } from "../media/RawFrame";
import { SLog, SLogger } from "../network/Helper";
import { AudioProcessor } from "./AudioProcessor";
import { AutoplayResolver } from "./AutoplayResolver";

/** 
 * true - replay audio via AudioProcessor via AudioContext to use panning
 * false - replay via HTMLVideoElement ( pre V0.9864)
 * 
 */
const AUDIO_PROCESSING = true;


/**
 * Mostly used for debugging at the moment. Browser API doesn't seem to have a standard way to
 * determine if a frame was updated. This class currently uses several different methods based
 * on availability 
 * 
 */
enum FrameEventMethod{
    /**We use a set default framerate. FPS is unknown and we can't recognize if a frame was updated. 
     * Used for remote video tracks on firefox as the "framerate" property will not be set.
     */
    DEFAULT_FALLBACK = "DEFAULT_FALLBACK",
    /**
     * Using the tracks meta data to decide the framerate. We might drop frames or deliver them twice
     * because we can't tell when exactly they are updated.
     * Some video devices also claim 30 FPS but generate less causing us to waste performance copying the same image
     * multiple times
     * 
     * This system works with local video in firefox
     */
    TRACK = "TRACK",
    /**
     *  uses frame numbers returned by the browser. This works for webkit based browsers only so far.
     *  Firefox is either missing the needed properties or they return always 0
     */
    EXACT = "EXACT"
}

/**Internal use only. 
 * Bundles all functionality related to MediaStream, Tracks and video processing.
 * It creates two HTML elements: Video and Canvas to interact with the video stream
 * and convert the visible frame data to Uint8Array for compatibility with the
 * unity plugin and all other platforms.
 * 
 */
export class BrowserMediaStream {

    //no double buffering in java script as it forces us to create a new frame each time

    //for debugging. Will attach the HTMLVideoElement used to play the local and remote
    //video streams to the document.
    public static DEBUG_SHOW_ELEMENTS = false;
    

    //Gives each FrameBuffer and its HTMLVideoElement a fixed id for debugging purposes.
    public static sNextInstanceId = 1;

    
    public static VERBOSE = false;


    private mStream: MediaStream;
    public get Stream() {
        return this.mStream;
    }
    private mLocal: boolean;
    private mCurrentFrame: IFrameData = null;

    private mInstanceId = 0;
    private mIdentity: string = "Stream";

    private mVideoElement: HTMLVideoElement;
    public get VideoElement() {
        return this.mVideoElement;
    }
    private mCanvasElement: HTMLCanvasElement = null;
    private mIsActive = false;

    private mAudioProcessor: AudioProcessor = null;

    //Framerate used as a workaround if
    //the actual framerate is unknown due to browser restrictions
    public static DEFAULT_FRAMERATE = 30;
    private mMsPerFrame = 1.0 / BrowserMediaStream.DEFAULT_FRAMERATE * 1000;

    private mFrameEventMethod = FrameEventMethod.DEFAULT_FALLBACK;
    //used to buffer last volume level as part of the
    //autoplat workaround that will mute the audio until it gets the ok from the user
    private mDefaultVolume = 0.5;
    

    //Time the last frame was generated
    private mLastFrameTime = 0;
    private mNextFrameTime = 0;

    /** Number of the last frame (not yet supported in all browsers)
     * if it remains at <= 0 then we just generate frames based on
     * the timer above
     */
    private mLastFrameNumber = 0;

    private mHasVideo: boolean = false;

    private log: SLogger;

    public InternalStreamAdded: (stream: BrowserMediaStream) => void = null;


    /**If previously play triggered an error the AutoplayResolver can
     * attempt to play again after the user interacted with the webpage.
     * 
     * Mostly used on iOS Safari. This feature is error prone and can only
     * be manually tested keep log verbose!
     */
    public ResolveAutoplay(): void{
        //call play again if needed
        if (this.mVideoElement)
        {
            if (this.mVideoElement.paused)
            {
                this.log.L("Attempting to play HTMLVideoElement");
                this.mVideoElement.play().then(() => {
                    AutoplayResolver.RemoveCompleted(this);
                    this.log.L("Playing video element was successful");
                }).catch((error) => { 
                    //if this happens we have no way of recovering for now
                    this.log.LE("Playing video element failed with error: " + error);
                });
            } else {
                this.log.L("ResolveAutoplay called but HTMLVideoElement was already playing");
            }
        } else {
            this.log.L("ResolveAutoplay after disposal");
        }
    }


    constructor(isLocal: boolean, baseLogger: SLogger = new SLogger("")) {

        this.mStream = new MediaStream();
        this.mLocal = isLocal;
        this.mInstanceId = BrowserMediaStream.sNextInstanceId;
        BrowserMediaStream.sNextInstanceId++;
        this.log = baseLogger.CreateSub(this.mIdentity + this.mInstanceId);

        this.mMsPerFrame = 1.0 / BrowserMediaStream.DEFAULT_FRAMERATE * 1000;
        this.mFrameEventMethod = FrameEventMethod.DEFAULT_FALLBACK;
        

        this.SetupElements();
    }

    /**Adds or replaces a track with a new track of the same kind
     * 
     * @param new_track Track to add / replace the current track with
     */
    public UpdateTrack(new_track: MediaStreamTrack) {
        
        //make sure we only have 1 track each
        this.mStream.getTracks().forEach((track) => {
            if (track.kind == new_track.kind)
            {
                this.log.L("Replacing track of type " + track.kind);
                this.mStream.removeTrack(track);
            }
        });
        
        //this.log.L("Adding new track of type " + new_track.kind + " muted?" + new_track.muted + " enabled?" + new_track.enabled);
        this.mStream.addTrack(new_track);
        this.UpdateAudioProcessing();
        this.UpdateVideoProcessing();
    }

    /**Removes a track from the Stream.
     * 
     * @param track track to remove
     */
    public RemoveTrack(track: MediaStreamTrack) {
        return;
        this.log.L("Removing track of type " + track.kind + " muted?" + track.muted + " enabled?" + track.enabled);
        this.mStream.removeTrack(track);
    }
    /**
     * This resets the srcObject property of the VideoElement. 
     * Used to force a clean reload after removing a track
     * (Chrome single negotiation workaround)
     */
    public ResetObject() {
        if (AUDIO_PROCESSING && this.mStream.getAudioTracks().length > 0 && this.mLocal == false) {
            
            if (this.mAudioProcessor == null)
                this.mAudioProcessor = new AudioProcessor();
            this.mVideoElement.srcObject = this.mAudioProcessor.InjectPanner(this.mStream);
            if (AudioProcessor.AUDIO_PROCESSING_CHROME_WORKAROUND) {
                //If audio processing is active and chrome is used we play audio
                //via the audio context in AudioProcessor and keep the original audio track connected to the HTMLVideoElement
                this.mVideoElement.muted = true;
            }
        } else {
            this.mVideoElement.srcObject = this.mStream;
        }
    }


    /**Tries to determine a good video framerate.
     * 1. Either the browser returns exact frame numbers via webkitDecodedFrameCount
     * 2. or it might have a property frameRate (likely only available for local video)
     * 3. if all fails we use DEFAULT_FRAMERATE as a fallback
     */
    private DetermineFrameEventMethod():void
    {
        if(this.mVideoElement)
        {
            if (this.mStream.getVideoTracks().length > 0)
            {
                let vtrack = this.mStream.getVideoTracks()[0];
                let settings = vtrack.getSettings();
                let fps = settings.frameRate;
                if(fps)
                {
                    if(BrowserMediaStream.VERBOSE)
                    {
                        this.log.LV("Track FPS: " + fps);
                    }
                    this.mMsPerFrame = 1.0 / fps * 1000;
                    this.mFrameEventMethod = FrameEventMethod.TRACK;
                }
            }

            //try to get the video fps via the track
            //fails on firefox if the track comes from a remote source
            if(this.GetFrameNumber() != -1)
            {
                if(BrowserMediaStream.VERBOSE)
                {
                    this.log.LV("Get frame available.");
                }
                //browser returns exact frame information
                this.mFrameEventMethod = FrameEventMethod.EXACT;
            }

            //failed to determine any frame rate. This happens on firefox with
            //remote tracks
            if(this.mFrameEventMethod === FrameEventMethod.DEFAULT_FALLBACK)
            {
                //firefox and co won't tell us the FPS for remote stream
                this.log.LW("Framerate unknown for stream " + this.mInstanceId + ". Using default framerate of " + BrowserMediaStream.DEFAULT_FRAMERATE);
            }
        }
    }

    private UpdateAudioProcessing() { 
        this.ResetObject();

    }
    /**
     * Called when meta data first becomes available or when tracks are changed.
     * Might trigger several times in the row e.g. first a track might be available but width/height unknown
     * until onloadmetadata triggers and calls it again.
     * 
     * If video is available this checks the current framerate and creates a canvas
     * used to process frames. 
     * If video is unavailable it destroys the canvas.
     * 
     * 
     */
    private UpdateVideoProcessing() {
        
        if (!this.mVideoElement)
            return;

        if (this.mStream.getVideoTracks().length == 0) {
            this.mHasVideo = false;
            this.DestroyCanvas();
            return;
        }
        
        this.mHasVideo = true;
        this.DetermineFrameEventMethod();
        //ensure we have a canvas if not created during a previous UpdateVideoProcessing yet
        if(!this.mCanvasElement)
            this.SetupCanvas();
    }

    private TriggerAutoplayBlockled(){

        AutoplayResolver.RequestAutoplayFix(this);
    }

    private TryPlay(){

        let playPromise = this.mVideoElement.play();
        this.mDefaultVolume = this.mVideoElement.volume;
        playPromise.then(function() {
            //all good
        }).catch((error) => {
            //browser blocked replay. print error & setup auto play workaround
            this.log.LW("Media playback failed. This might be caused by the browser blocking autoplay.");
            console.error(error);
            this.TriggerAutoplayBlockled();
        });
    }

    private SetupElements() {

        let source = "remote";
        if (this.mLocal)
            source = "local";
        this.mVideoElement = this.SetupVideoElement();
        //TOOD: investigate bug here
        //In some cases onloadedmetadata is never called. This might happen due to a 
        //bug in firefox or might be related to a device / driver error
        //So far it only happens randomly (maybe 1 in 10 tries) on a single test device and only
        //with 720p. (video device "BisonCam, NB Pro" on MSI laptop)
        this.log.L("video element created for " + source + " video tracks: " + this.mStream.getVideoTracks().length + " audio:" +this.mStream.getAudioTracks().length);
        this.mVideoElement.onloadedmetadata = (e) => {
            //we might have shutdown everything by now already
            if (this.mVideoElement == null)
            {
                this.log.L("Stream destroyed by the time onloadedmetadata triggered. Skip event.");
                return;
            }

            this.TryPlay();

            if(this.InternalStreamAdded != null)
                this.InternalStreamAdded(this);

            this.UpdateVideoProcessing();
            let video_log = "onloadedmetadata: " + source + " audio: " + (this.mStream.getAudioTracks().length > 0) + " Resolution: " + this.mVideoElement.videoWidth + "x" + this.mVideoElement.videoHeight 
                + " fps method: " + this.mFrameEventMethod + " " + Math.round(1000/(this.mMsPerFrame));
            this.log.L(video_log);
            
            this.mIsActive = true;
        };
        //set the src value and trigger onloadedmetadata above
        try {
            this.ResetObject();
        }
        catch (error)
        {
            //old way of doing it. won't work anymore in firefox and possibly other browsers
            this.mVideoElement.src = window.URL.createObjectURL(this.mStream as any);
        }
    }


    /** Returns the current frame number.
     *  Treat a return value of 0 or smaller as unknown.
     * (Browsers might have the property but 
     * always return 0)
     */
    private GetFrameNumber() : number
    {
        let frameNumber;
        if(this.mVideoElement)
        {
            if((this.mVideoElement as any).webkitDecodedFrameCount)
            {
                frameNumber = (this.mVideoElement as any).webkitDecodedFrameCount;
            }
            /*
            None of these work and future versions might return numbers that are only
            updated once a second or so. For now it is best to ignore these.

            TODO: update 2023 these do still not work with remote streams and just return 0 (mozPainted only works if the element is visible)
            this.mVideoElement.currentTime also won't work because it is unrelated to framerate
            else if((this.mVideoElement as any).mozParsedFrames)
            {
                frameNumber = (this.mVideoElement as any).mozParsedFrames;
            }else if((this.mVideoElement as any).mozDecodedFrames)
            {
                frameNumber = (this.mVideoElement as any).mozDecodedFrames;
            }else if((this.mVideoElement as any).decodedFrameCount)
            {
                frameNumber = (this.mVideoElement as any).decodedFrameCount;
            }
            */
            else
            {
                frameNumber =  -1;
            }
        }else{
            frameNumber = -1;
        }
        return frameNumber;
    }

    public TryGetFrame(): IFrameData
    {
        //make sure we get the newest frame
        //this.EnsureLatestFrame();

        //remove the buffered frame if any
        var result = this.mCurrentFrame;
        this.mCurrentFrame = null;
        
        return result;
    }
    public SetMute(mute: boolean): void {
        if (this.mVideoElement)
        {
            //Usually, we use mute only for local video. If used for another reason on remote video
            //while audio processing is active it will fail due to chrome workaround (audio isn't replayed
            //via video element). Shouldn't ever happen under normal usage.
            if (this.mAudioProcessor && AudioProcessor.AUDIO_PROCESSING_CHROME_WORKAROUND) {
                this.log.LW("SetMute ignored due to audio processing");
                return;
            }
            this.mVideoElement.muted = mute;
        }
    }
    public PeekFrame(): IFrameData {
        //this.EnsureLatestFrame();
        return this.mCurrentFrame;
    }

    /** Ensures we have the latest frame ready
     * for the next PeekFrame / TryGetFrame calls
     */
    private EnsureLatestFrame():boolean
    {
        if (this.HasNewerFrame()) {
            this.GenerateFrame();
            return true;
        }
        return false;
    }

    /** checks if the html tag has a newer frame available
     * (or if 1/30th of a second passed since last frame if
     * this info isn't available)
     */
    private HasNewerFrame():boolean
    {
        if (this.mIsActive 
            && this.mHasVideo 
            && this.mCanvasElement != null
            && this.mVideoElement.videoWidth > 0 //these are 0 for a while when a new video track is added
            && this.mVideoElement.videoHeight > 0
        )
            {
                if(this.mLastFrameNumber > 0)
                {
                    this.mFrameEventMethod = FrameEventMethod.EXACT;
                    //we are getting frame numbers. use those to 
                    //check if we have a new one
                    if(this.GetFrameNumber() > this.mLastFrameNumber)
                    {
                        return true;
                    }
                }
                else
                {
                    //many browsers do not share the frame info
                    let now = new Date().getTime();
                    if (this.mNextFrameTime <= now) {
                    {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    
    public Update(): void {
        this.EnsureLatestFrame();
    }

    private DestroyCanvas(): void {
        //for testing we might add it to the DOM. make sure we remove it again.
        if (this.mCanvasElement != null && this.mCanvasElement.parentElement != null) {
            this.mCanvasElement.parentElement.removeChild(this.mCanvasElement);
        }
        this.mCanvasElement = null;
    }
    private DestroyVideoElement(): void {
        //for testing we might add it to the DOM. make sure we remove it again.
        
        if (this.mVideoElement != null && this.mVideoElement.parentElement != null) {
            this.mVideoElement.parentElement.removeChild(this.mVideoElement);
        }
        this.mVideoElement = null;
    }

    
    public Dispose(): void {
        this.log.L("Disposing stream " + this.mInstanceId);
        this.mIsActive = false;
        AutoplayResolver.Remove(this);
        this.DestroyCanvas();
        if (this.mAudioProcessor != null)
            this.mAudioProcessor.Dispose();
        this.DestroyVideoElement();
        this.mStream.getTracks().forEach((x) => { x.stop(); });
        this.mStream = null;

    }

    public CreateFrame(): RawFrame {
        if (this.mVideoElement.videoWidth <= 0 || this.mVideoElement.videoHeight <= 0)
        {
            //This happens right after we attached a new track to an existing stream. 
            //onloadedmetadata is not triggered in this situation so we have to
            //keep polling until we can finally get a frame
            //TODO: Update HasNewerFrame to prevent this from being triggered
            //if there is no better workaround that actually allows us to detect
            //the metadata when ready
            this.log.LW("Frame skipped. videoWidth / videoHeight were 0.");
            return null;
        }

        this.mCanvasElement.width = this.mVideoElement.videoWidth;
        this.mCanvasElement.height = this.mVideoElement.videoHeight;
        let ctx = this.mCanvasElement.getContext("2d");
        /*
        var fillBackgroundFirst = true;
        if (fillBackgroundFirst) {
            ctx.clearRect(0, 0, this.mCanvasElement.width, this.mCanvasElement.height);
        }
        */
        ctx.drawImage(this.mVideoElement, 0, 0);
 
        try {
            //risk of security exception in firefox
            let imgData = ctx.getImageData(0, 0, this.mCanvasElement.width, this.mCanvasElement.height);
            var imgRawData = imgData.data;
            var array = new Uint8Array(imgRawData.buffer);
            return new RawFrame(array, this.mCanvasElement.width, this.mCanvasElement.height);
        } catch (exception) {

            //show white frame for now
            var array = new Uint8Array(this.mCanvasElement.width * this.mCanvasElement.height * 4);
            array.fill(255, 0, array.length - 1);
            let res =  new RawFrame(array, this.mCanvasElement.width, this.mCanvasElement.height);

            //attempted workaround for firefox bug / suspected cause: 
            // * root cause seems to be an internal origin-clean flag within the canvas. If set to false reading from the
            //   canvas triggers a security exceptions. This is usually used if the canvas contains data that isn't 
            //   suppose to be accessible e.g. a picture from another domain
            // * while moving the image to the canvas the origin-clean flag seems to be set to false but only 
            //   during the first few frames. (maybe a race condition within firefox? A higher CPU workload increases the risk)
            // * the canvas will work and look just fine but calling getImageData isn't allowed anymore
            // * After a few frames the video is back to normal but the canvas will still have the flag set to false
            // 
            //Solution:
            // * Recreate the canvas if the exception is triggered. During the next few frames firefox should get its flag right
            //   and then stop causing the error. It might recreate the canvas multiple times until it finally works as we
            //   can't detect if the video element will trigger the issue until we tried to access the data
            this.log.LW("Firefox workaround: Refused access to the remote video buffer. Retrying next frame...");
            this.DestroyCanvas();
            this.SetupCanvas();
            return res;
        }
    }

    //Old buffed frame was replaced with a wrapepr that avoids buffering internally
    //Only point of generate frame is now to ensure a consistent framerate
    private GenerateFrame(): void
    {
        this.mLastFrameNumber = this.GetFrameNumber();
        
        let now = new Date().getTime();
        //js timing is very inaccurate. reduce time until next frame if we are
        //late with this one.
        let diff = now - this.mNextFrameTime;
        let delta = (this.mMsPerFrame - diff);
        delta = Math.min(this.mMsPerFrame, Math.max(1, delta))
        this.mLastFrameTime = now;
        this.mNextFrameTime = now + delta;
        //this.log.LV("last frame , new frame", this.mLastFrameTime, this.mNextFrameTime, delta);
        this.mCurrentFrame = new LazyFrame(this);
    }




    private SetupVideoElement(): HTMLVideoElement {

        var videoElement: HTMLVideoElement= document.createElement("video");
        //width/doesn't seem to be important
        videoElement.width = 320;
        videoElement.height = 240;
        if(this.mLocal == false)
            videoElement.controls = true;
        //needed for Safari on iPhone
        videoElement.setAttribute("playsinline", "");
        videoElement.id = "awrtc_mediastream_video_" + this.mInstanceId;
        
        if (BrowserMediaStream.DEBUG_SHOW_ELEMENTS)
            document.body.appendChild(videoElement);

        return videoElement;
    }

    private SetupCanvas(): HTMLCanvasElement {

        if (this.mVideoElement == null)
        {
            this.log.LE("SetupCanvas was called without HTMLVideoElement");
            return;
        }

        var canvas: HTMLCanvasElement = document.createElement("canvas");
        //removed. Video width / height might be 0 at the start until metadata is available
        //console.log("Creating canvas with width " + this.mVideoElement.videoWidth);
        //canvas.width = this.mVideoElement.videoWidth;
        //canvas.height = this.mVideoElement.videoHeight;
        canvas.id = "awrtc_mediastream_canvas_" + this.mInstanceId;

        if (BrowserMediaStream.DEBUG_SHOW_ELEMENTS)
            document.body.appendChild(canvas);
        this.mCanvasElement = canvas;
    }

    public SetVolume(volume: number): void {
        if (this.mVideoElement == null) {
            return;
        }
        if (volume < 0)
            volume = 0;
        if (volume > 1)
            volume = 1;
        if (this.mAudioProcessor != null)
        {
            this.mAudioProcessor.SetVolumePan(volume, 0);
        } else {
            this.mVideoElement.volume = volume;
        }
    }
    public SetVolumePan(volume: number, pan: number): void {
        if (this.mVideoElement == null) {
            return;
        }
        if (volume < 0)
            volume = 0;
        if (volume > 1)
            volume = 1;
        if (this.mAudioProcessor != null)
        {
            this.mAudioProcessor.SetVolumePan(volume, pan);
        } else {
            this.log.LW("setVolumePan ignored the pan value. Audio processing is not available.");
            this.mVideoElement.volume = volume;
        }
    }

    /**
     * @returns true if a audio track is attached to the stream, false if not
     */
    public HasAudioTrack(): boolean {
        if (this.mStream != null && this.mStream.getAudioTracks() != null
            && this.mStream.getAudioTracks().length > 0) {
            return true;
        }
        return false;
    }
    /**
     * @returns true if a video track is attached to the stream, false it not
     */
    public HasVideoTrack(): boolean {
        if (this.mStream != null && this.mStream.getVideoTracks() != null
            && this.mStream.getVideoTracks().length > 0) {
            return true;
        }
        return false;
    }

    /**
     * 
     * @returns the used audio track or null if none
     */
    public GetAudioTrack(): MediaStreamTrack{
        if (this.mStream.getAudioTracks().length > 0)
            return this.mStream.getAudioTracks()[0];
        return null;
    }
    /**
     * @returns the used video track or null if none
     */
    public GetVideoTrack(): MediaStreamTrack{
        if (this.mStream.getVideoTracks().length > 0)
            return this.mStream.getVideoTracks()[0];
        return null;
    }
}
