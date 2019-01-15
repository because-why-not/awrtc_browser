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
import { IFrameData, RawFrame, LazyFrame } from "../media/RawFrame";
import { SLog } from "../network/Helper";



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

    //TODO: remove this flag. it is now always using lazy frames
    public static sUseLazyFrames = true;
    

    //Gives each FrameBuffer and its HTMLVideoElement a fixed id for debugging purposes.
    public static sNextInstanceId = 1;

    


    private mStream: MediaStream;
    public get Stream() {
        return this.mStream;
    }
    private mBufferedFrame: IFrameData = null;

    private mInstanceId = 0;

    private mVideoElement: HTMLVideoElement;
    public get VideoElement() {
        return this.mVideoElement;
    }
    private mCanvasElement: HTMLCanvasElement = null;
    private mIsActive = false;

    //Framerate used as a workaround if
    //the actual framerate is unknown due to browser restrictions
    public static DEFAULT_FRAMERATE = 25;
    private mMsPerFrame = 1.0 / BrowserMediaStream.DEFAULT_FRAMERATE * 1000;
    private mFrameRateKnown = false;

    //Time the last frame was generated
    private mLastFrameTime = 0;

    /** Number of the last frame (not yet supported in all browsers)
     * if it remains at <= 0 then we just generate frames based on
     * the timer above
     */
    private mLastFrameNumber = 0;

    private mHasVideo: boolean = false;

    public InternalStreamAdded: (stream: BrowserMediaStream) => void = null;
    


    constructor(stream: MediaStream) {
        this.mStream = stream;
        this.mInstanceId = BrowserMediaStream.sNextInstanceId;
        BrowserMediaStream.sNextInstanceId++;

        if (this.mStream.getVideoTracks().length > 0)
        {
            this.mHasVideo = true;
            let vtrack = this.mStream.getVideoTracks()[0];
            let settings = vtrack.getSettings();
            let fps = settings.frameRate;
            if(fps)
            {
                this.mMsPerFrame = 1.0 / fps * 1000;
                this.mFrameRateKnown = true;
            }
        }

        this.SetupElements();
    }
    private CheckFrameRate():void
    {
        //in chrome the track itself might miss the framerate but
        //we still know when it updates trough webkitDecodedFrameCount
        if(this.mVideoElement && typeof (this.mVideoElement as any).webkitDecodedFrameCount !== "undefined")
        {
            this.mFrameRateKnown = true;
        }
        if(this.mFrameRateKnown === false)
        {
            //firefox and co won't tell us the FPS for remote stream
            SLog.LW("Framerate unknown. Using default framerate of " + BrowserMediaStream.DEFAULT_FRAMERATE);
            
        }
    }
    public SetupElements() {

        this.mVideoElement = this.SetupVideoElement();
        //TOOD: investigate bug here
        //In some cases onloadedmetadata is never called. This might happen due to a 
        //bug in firefox or might be related to a device / driver error
        //So far it only happens randomly (maybe 1 in 10 tries) on a single test device and only
        //with 720p. (video device "BisonCam, NB Pro" on MSI laptop)
        SLog.L("video element created. video tracks: " + this.mStream.getVideoTracks().length);
        this.mVideoElement.onloadedmetadata = (e) => {

            this.mVideoElement.play();
            if(this.InternalStreamAdded != null)
                this.InternalStreamAdded(this);

            this.CheckFrameRate();
            
			SLog.L("Resolution: " + this.mVideoElement.videoWidth + "x" + this.mVideoElement.videoHeight);
            //now create canvas after the meta data of the video are known
            if (this.mHasVideo) {
                this.mCanvasElement = this.SetupCanvas();

                //canvas couldn't be created. set video to false
                if (this.mCanvasElement == null)
                    this.mHasVideo = false;
            } else {
                this.mCanvasElement = null;
            }
            this.mIsActive = true;
        };
        //set the src value and trigger onloadedmetadata above
        try {
            //newer method. not yet supported everywhere
            let element : any = this.mVideoElement;
            element.srcObject = this.mStream;
        }
        catch (error)
        {
            //old way of doing it. won't work anymore in firefox and possibly other browsers
            this.mVideoElement.src = window.URL.createObjectURL(this.mStream);
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
            //to find out if we got a new frame
            //chrome has webkitDecodedFrameCount
            //firefox mozDecodedFrames, mozParsedFrames,  mozPresentedFrames seems to be always 0 so far
            //mozPaintedFrames turned out useless as it only updates if the tag is visible
            //no idea about all others
            //
            frameNumber = (this.mVideoElement as any).webkitDecodedFrameCount
                //|| this.mVideoElement.currentTime can't be used updates every call
                || -1;
        }else{
            frameNumber = -1;
        }
        return frameNumber;
    }

    //TODO: Buffering
    public TryGetFrame(): IFrameData
    {
        //make sure we get the newest frame
        this.EnsureLatestFrame();

        //remove the buffered frame if any
        var result = this.mBufferedFrame;
        this.mBufferedFrame = null;
        
        return result;
    }
    public SetMute(mute: boolean): void {
        this.mVideoElement.muted = mute;
    }
    public PeekFrame(): IFrameData {
        this.EnsureLatestFrame();
        return this.mBufferedFrame;
    }

    /** Ensures we have the latest frame ready
     * for the next PeekFrame / TryGetFrame calls
     */
    private EnsureLatestFrame():boolean
    {
        if (this.HasNewerFrame()) {
            this.FrameToBuffer();
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
            && this.mCanvasElement != null)
            {
                if(this.mLastFrameNumber > 0)
                {
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
                    //so far we just generate 30 FPS as a work around
                    let now = new Date().getTime();
                    let div = now - this.mLastFrameTime;
                    if (div >= this.mMsPerFrame) {
                    {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    
    public Update(): void {
        //moved to avoid creating buffered frames if not needed
        //this.EnsureLatestFrame();
    }

    public DestroyCanvas(): void {
        if (this.mCanvasElement != null && this.mCanvasElement.parentElement != null) {
            this.mCanvasElement.parentElement.removeChild(this.mCanvasElement);
        }
    }
    public Dispose(): void {

        this.mIsActive = false;
        this.DestroyCanvas();
        if (this.mVideoElement != null && this.mVideoElement.parentElement != null) {
            this.mVideoElement.parentElement.removeChild(this.mVideoElement);
        }

        //track cleanup is probably not needed but
        //it might help ensure it properly stops
        //in case there are other references out there
        var tracks = this.mStream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
            tracks[i].stop();
        }
        
        this.mStream = null;
        this.mVideoElement = null;
        this.mCanvasElement = null;
    }

    public CreateFrame(): RawFrame {

        this.mCanvasElement.width = this.mVideoElement.videoWidth;
        this.mCanvasElement.height = this.mVideoElement.videoHeight;
        let ctx = this.mCanvasElement.getContext("2d");

        var fillBackgroundFirst = true;
        if (fillBackgroundFirst) {
            ctx.clearRect(0, 0, this.mCanvasElement.width, this.mCanvasElement.height);
        }
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
            SLog.LogWarning("Firefox workaround: Refused access to the remote video buffer. Retrying next frame...");
            this.DestroyCanvas();
            this.mCanvasElement = this.SetupCanvas();
            return res;
        }
    }

    private FrameToBuffer(): void
    {
        this.mLastFrameTime = new Date().getTime();
        this.mLastFrameNumber = this.GetFrameNumber();
        this.mBufferedFrame = new LazyFrame(this);
    }




    private SetupVideoElement(): HTMLVideoElement {

        var videoElement: HTMLVideoElement= document.createElement("video");
        //width/doesn't seem to be important
        videoElement.width = 320;
        videoElement.height = 240;
        videoElement.controls = true;
        videoElement.id = "awrtc_mediastream_video_" + this.mInstanceId;
        //videoElement.muted = true;
        if (BrowserMediaStream.DEBUG_SHOW_ELEMENTS)
            document.body.appendChild(videoElement);

        return videoElement;
    }

    private SetupCanvas(): HTMLCanvasElement {

        if (this.mVideoElement == null || this.mVideoElement.videoWidth <= 0 ||
            this.mVideoElement.videoHeight <= 0)
            return null;

        var canvas: HTMLCanvasElement= document.createElement("canvas");
        canvas.width = this.mVideoElement.videoWidth;
        canvas.height = this.mVideoElement.videoHeight;
        canvas.id = "awrtc_mediastream_canvas_" + this.mInstanceId;

        if (BrowserMediaStream.DEBUG_SHOW_ELEMENTS)
            document.body.appendChild(canvas);
        return canvas;
    }

    public SetVolume(volume: number): void {
        if (this.mVideoElement == null) {
            return;
        }
        if (volume < 0)
            volume = 0;
        if (volume > 1)
            volume = 1;
        this.mVideoElement.volume = volume;
    }

    public HasAudioTrack(): boolean {
        if (this.mStream != null && this.mStream.getAudioTracks() != null
            && this.mStream.getAudioTracks().length > 0) {
            return true;
        }
        return false;
    }
    public HasVideoTrack(): boolean {
        if (this.mStream != null && this.mStream.getVideoTracks() != null
            && this.mStream.getVideoTracks().length > 0) {
            return true;
        }
        return false;
    }

    //for debugging purposes this is in here
}