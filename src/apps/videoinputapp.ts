import * as awrtc from "../awrtc/index"
import { WebRtcHelper } from "../awrtc/index";

/** Based on a copy of the CallApp to test custom video input
    This example shows how to send a stream from a canvas.  By default it will play an 
    animation moving along a 360 degree panorama. With higher resolution / speeds this
    will push WebRTC to its bitrate limit and make quality & performance issues more
    visible for testing purposes.
    Resolution & speed can be changed below to test different scenarios. By default
    WebRTC usually hits a limit around 2.5 MBit/s.

    See InitCanvas and videoinputapp for configuration
        
 */

function InitCanvas(selector:string, width: number, height: number, fps: number) : HTMLCanvasElement { 

    const canvas = document.querySelector(selector) as HTMLCanvasElement;
    
    canvas.width = width;
    canvas.height = height;

    //FPS for the animation. 0 for no fps limit
    const targetFps = fps;
    //speed of the test animation in pixels / sec
    const speed = canvas.width / 2; 
    //fast. needs high bitrate or webrtc will drop quality
    //const speed = 10000;

    //Image used for test animation
    const drawImage = true;
    
    //draw a few 1px wide lines as overlay. this helps seeing visible compression issues on the receiver side
    const drawLines = true;


    let imageOffset = 0;
    let img = new Image();
    img.src = 'flagstaff_loop.jpg'; 
    

    let counter = 0;
    let lastFrame = Date.now();


    const ctx = canvas.getContext("2d");
    
    function loop()
    {
        if (ctx == null) {
            console.error("No context. ctx == null");
            return;
        }
        let now = Date.now();
        let elapsed = (now - lastFrame) / 1000;
        elapsed = Math.round(elapsed * 1000) / 1000;
        lastFrame = now;
        //draw a background. if we see this color something is broken
        ctx.fillStyle = "#770000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if(drawImage)
        {
            const scaledWidth = img.width * (canvas.height / img.height);
            ctx.drawImage(img, imageOffset, 0, scaledWidth, canvas.height);
            ctx.drawImage(img, scaledWidth + imageOffset, 0, scaledWidth, canvas.height);
            imageOffset -= speed * elapsed;
            if (-imageOffset >= scaledWidth) {
                imageOffset = 0;
            }
        }

        if (drawLines)
        {
            for(let i = 0; i< 11; i++){       
                let {x,y} = getCoordinates(90 / 10 * i)
                ctx.strokeStyle = "#000000";      
                //ctx.lineWidth = i + 1;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(3820 * x, 2160 * y);
                ctx.closePath();
                ctx.stroke();
            }
        }

        

        counter++;

        //prepare next frame
        if(targetFps == 0)
        {
            requestAnimationFrame(loop);
        }else{
            //to reduce the FPS but isn't very accurate
            setTimeout(()=>{
                requestAnimationFrame(loop);
            }, 1000 / targetFps);
        }
    }
    function getCoordinates(angle) {
        const radians = (Math.PI / 180) * angle;  // Convert the angle to radians
        const x = Math.cos(radians);  // Calculate the x coordinate
        const y = Math.sin(radians);  // Calculate the y coordinate
        return {x: x, y: y};
    }
    loop();
    return canvas;
}

export function videoinputapp(parent: HTMLElement, selector: string) {
    WebRtcHelper.EmitAdapter();
    let app: VideoInputApp;
    console.log("init callapp");
    if (parent == null) {
        console.log("parent was null");
        parent = document.body;
    }
    awrtc.SLog.SetLogLevel(awrtc.SLogLevel.Info);
    app = new VideoInputApp();
    
    //how often the canvas renders a new frame
    //0 => use requestAnimationFrame instead of setting an exact framerate
    //values above 30 might not work well due to setInterval resolution
    let render_fps = 0;

    //how often WebRTC captures and sends a frame (assuming network & cpu can keep up)
    //0 => let the browser handle it automatically
    //watch out setting values around 30 here seems to cause a lot more stuttering than expected. best to keep at 0
    let stream_fps = 0;
    //changes the size of the canvas. 1080p works well with VideoBitrateKbits set to 10,000.
    //it takes a 30 sec or so for WebRTC to slowly increase bitrate
    let width = 1920; let height = 1080; 

    //uncomment below to overwrite WebRTC defaults
    app.MediaConfig.VideoBitrateKbits = 10000;
    //app.MediaConfig.VideoCodecs = ["VP8", "H264", "VP9"];
    //app.MediaConfig.VideoContentHint = "detail";
    
    

    const canvas = InitCanvas(selector, width, height, render_fps) as HTMLCanvasElement;
    const devname = selector;
    awrtc.Media.SharedInstance.VideoInput.AddCanvasDevice(canvas, devname, canvas.width, canvas.height, stream_fps);
    

    app.setupUi(parent, devname);
}
    
export class VideoInputApp {
    
    private mAddress;
    private mNetConfig = new awrtc.NetworkConfig();
    private mCall: awrtc.BrowserWebRtcCall = null;

    //update loop
    private mIntervalId: any = -1;

    private mLocalVideo: HTMLVideoElement = null;
    private mRemoteVideo = {};

    private mIsRunning = false;

    public constructor() {
        this.mNetConfig.IceServers = [
            { urls: "stun:t.y-not.app:443" },
            { urls: "stun:stun.l.google.com:19302" }
        ];
        //use for testing conferences 
        //this.mNetConfig.IsConference = true;
        //this.mNetConfig.SignalingUrl = "wss://s.y-not.app/testshared";
        this.mNetConfig.IsConference = false;
        this.mNetConfig.SignalingUrl = "wss://s.y-not.app/callapp";
    }



    private GetParameterByName(name) {
        var url = window.location.href;
        name = name.replace(/[\[\]]/g, "\\$&");
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"), results = regex.exec(url);
        if (!results)
            return null;
        if (!results[2])
            return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }
    private tobool(value, defaultval) {
        if (value === true || value === "true")
            return true;
        if (value === false || value === "false")
            return false;

        return defaultval;
    }





    public Start(): void {
        if (this.mCall != null)
            this.Stop();


        this.mIsRunning = true;
        this.Ui_OnStart()
        console.log("start");
        console.log("Using signaling server url: " + this.mNetConfig.SignalingUrl);

        //create media configuration
        var config = this.mMediaConfig;


        //For usage in HTML set FrameUpdates to false and wait for  MediaUpdate to
        //get the VideoElement. By default awrtc would deliver frames individually
        //for use in Unity WebGL
        console.log("requested config:" + JSON.stringify(config));
        //setup our high level call class.
        this.mCall = new awrtc.BrowserWebRtcCall(this.mNetConfig);

        //handle events (get triggered after Configure / Listen call)
        //+ugly lambda to avoid loosing "this" reference
        this.mCall.addEventListener((sender, args) => {
            this.OnNetworkEvent(sender, args);
        });



        //As the system is designed for realtime graphics we have to call the Update method. Events are only
        //triggered during this Update call!
        this.mIntervalId = setInterval(() => {
            this.Update();

        }, 50);


        //configure media. This will request access to media and can fail if the user doesn't have a proper device or
        //blocks access
        this.mCall.Configure(config);

        //Try to listen to the address 
        //Conference mode = everyone listening will connect to each other
        //Call mode -> If the address is free it will wait for someone else to connect
        //          -> If the address is used then it will fail to listen and then try to connect via Call(address);
        this.mCall.Listen(this.mAddress);

    }



    public Stop(): void {
        this.Cleanup();
    }

    private Cleanup(): void {

        if (this.mCall != null) {
            this.mCall.Dispose();
            this.mCall = null;
            clearInterval(this.mIntervalId);
            this.mIntervalId = -1;
            this.mIsRunning = false;
            this.mLocalVideo = null;
            this.mRemoteVideo = {};
        }
        this.Ui_OnCleanup();
    }

    private Update(): void {
        if (this.mCall != null)
            this.mCall.Update();
    }

    private OnNetworkEvent(sender: any, args: awrtc.CallEventArgs): void {

        //User gave access to requested camera/ microphone
        if (args.Type == awrtc.CallEventType.ConfigurationComplete) {
            console.log("configuration complete");
        }
        else if (args.Type == awrtc.CallEventType.MediaUpdate) {

            let margs = args as awrtc.MediaUpdatedEventArgs;
            if (this.mLocalVideo == null && margs.ConnectionId == awrtc.ConnectionId.INVALID) {

                var videoElement = margs.VideoElement;
                this.mLocalVideo = videoElement;
                this.Ui_OnLocalVideo(videoElement);
                console.log("local video added resolution:" + videoElement.videoWidth + videoElement.videoHeight + " fps: ??");
            }
            else if (margs.ConnectionId != awrtc.ConnectionId.INVALID && this.mRemoteVideo[margs.ConnectionId.id] == null) {

                var videoElement = margs.VideoElement;
                this.mRemoteVideo[margs.ConnectionId.id] = videoElement;
                this.Ui_OnRemoteVideo(videoElement, margs.ConnectionId);
                console.log("remote video added resolution:" + videoElement.videoWidth + videoElement.videoHeight + " fps: ??");
            }
        }
        else if (args.Type == awrtc.CallEventType.ListeningFailed) {
            //First attempt of this example is to try to listen on a certain address
            //for conference calls this should always work (expect the internet is dead)
            if (this.mNetConfig.IsConference == false) {
                //no conference call and listening failed? someone might have claimed the address.
                //Try to connect to existing call
                this.mCall.Call(this.mAddress);
            }
            else {
                let errorMsg = "Listening failed. Offline? Server dead?";
                console.error(errorMsg);
                this.Ui_OnError(errorMsg);
                this.Cleanup();
                return;
            }
        }
        else if (args.Type == awrtc.CallEventType.ConnectionFailed) {
            //Outgoing call failed entirely. This can mean there is no address to connect to,
            //server is offline, internet is dead, firewall blocked access, ...
            let errorMsg = "Connection failed. Offline? Server dead? ";
            console.error(errorMsg);
            this.Ui_OnError(errorMsg);
            this.Cleanup();
            return;
        }
        else if (args.Type == awrtc.CallEventType.CallEnded) {
            //call ended or was disconnected
            var callEndedEvent = args as awrtc.CallEndedEventArgs;
            console.log("call ended with id " + callEndedEvent.ConnectionId.id);
            delete this.mRemoteVideo[callEndedEvent.ConnectionId.id];
            this.Ui_OnLog("Disconnected from user with id " + callEndedEvent.ConnectionId.id);
            //check if this was the last user
            if (this.mNetConfig.IsConference == false && Object.keys(this.mRemoteVideo).length == 0) {
                //1 to 1 call and only user left -> quit
                this.Cleanup();
                return;
            }
        }
        else if (args.Type == awrtc.CallEventType.Message) {
            //no ui for this yet. simply echo messages for testing
            let messageArgs = args as awrtc.MessageEventArgs;
            this.mCall.Send(messageArgs.Content, messageArgs.Reliable, messageArgs.ConnectionId);
        }
        else if (args.Type == awrtc.CallEventType.DataMessage) {
            //no ui for this yet. simply echo messages for testing
            let messageArgs = args as awrtc.DataMessageEventArgs;
            this.mCall.SendData(messageArgs.Content, messageArgs.Reliable, messageArgs.ConnectionId);
        }
        else if (args.Type == awrtc.CallEventType.CallAccepted) {
            let arg = args as awrtc.CallAcceptedEventArgs;
            console.log("New call accepted id: " + arg.ConnectionId.id);
        }
        else if (args.Type == awrtc.CallEventType.WaitForIncomingCall) {
            console.log("Waiting for incoming call ...");
        }
        else {
            console.log("Unhandled event: " + args.Type);
        }
    }


    //UI calls. should be moved out into its own class later
    private mMediaConfig = new awrtc.MediaConfig();
    public get MediaConfig() :  awrtc.MediaConfig {
        return this.mMediaConfig;
    }
       
    private mAutostart;
    private mUiAddress: HTMLInputElement;
    private mUiAudio: HTMLInputElement;
    private mUiVideo: HTMLInputElement;
    private mUiButton: HTMLButtonElement;
    private mUiUrl: HTMLElement;
    private mUiLocalVideoParent: HTMLElement;
    private mUiRemoteVideoParent: HTMLElement;

    public setupUi(parent: HTMLElement, deviceName:string) {
        this.mUiAddress = parent.querySelector<HTMLInputElement>(".callapp_address");
        this.mUiAudio = parent.querySelector<HTMLInputElement>(".callapp_send_audio");
        this.mUiVideo = parent.querySelector<HTMLInputElement>(".callapp_send_video");
        this.mUiUrl = parent.querySelector<HTMLParagraphElement>(".callapp_url");
        this.mUiButton = parent.querySelector<HTMLInputElement>(".callapp_button");
        this.mUiLocalVideoParent = parent.querySelector<HTMLParagraphElement>(".callapp_local_video");
        this.mUiRemoteVideoParent = parent.querySelector<HTMLParagraphElement>(".callapp_remote_video");
        this.mUiAudio.onclick = this.Ui_OnUpdate;
        this.mUiVideo.onclick = this.Ui_OnUpdate;
        this.mUiAddress.onkeyup = this.Ui_OnUpdate;
        this.mUiButton.onclick = this.Ui_OnStartStopButtonClicked;

        //set default value + make string "true"/"false" to proper booleans
        this.mMediaConfig.Audio = this.tobool(this.GetParameterByName("audio"), true)

        this.mMediaConfig.Video = this.tobool(this.GetParameterByName("video"), true);

        
        this.mMediaConfig.VideoDeviceName = deviceName;

        this.mAutostart = this.GetParameterByName("autostart");
        this.mAutostart = this.tobool(this.mAutostart, false);
        this.mAddress = this.GetParameterByName("a");


        //if autostart is set but no address is given -> create one and reopen the page
        if (this.mAddress === null && this.mAutostart == true) {
            this.mAddress = this.GenerateRandomKey();
            window.location.href = this.GetUrlParams();
        }
        else {
            if (this.mAddress === null)
                this.mAddress = this.GenerateRandomKey();
            this.Ui_Update();
        }

        //used for interacting with the Unity CallApp

        //current hack to get the html element delivered. by default this
        //just the image is copied and given as array
        //Lazy frames will be the default soon though


        if (this.mAutostart) {
            console.log("Starting automatically ... ")
            this.Start();
        }

        console.log("address: " + this.mAddress + " audio: " + this.mMediaConfig.Audio + " video: " + this.mMediaConfig.Video + " autostart: " + this.mAutostart);
    }
    private Ui_OnStart() {
        this.mUiButton.textContent = "Stop";
    }
    private Ui_OnCleanup() {
        this.mUiButton.textContent = "Join";
        while (this.mUiLocalVideoParent.hasChildNodes()) {
            this.mUiLocalVideoParent.removeChild(this.mUiLocalVideoParent.firstChild);
        }
        while (this.mUiRemoteVideoParent.hasChildNodes()) {
            this.mUiRemoteVideoParent.removeChild(this.mUiRemoteVideoParent.firstChild);
        }
    }
    private Ui_OnLog(msg: string) {

    }
    private Ui_OnError(msg: string) {

    }
    private Ui_OnLocalVideo(video: HTMLVideoElement) {
        this.mUiLocalVideoParent.appendChild(document.createElement("br"));
        this.mUiLocalVideoParent.appendChild(video);
    }

    private Ui_OnRemoteVideo(video: HTMLVideoElement, id: awrtc.ConnectionId) {

        this.mUiRemoteVideoParent.appendChild(document.createElement("br"));
        this.mUiRemoteVideoParent.appendChild(new Text("connection " + id.id));
        this.mUiRemoteVideoParent.appendChild(document.createElement("br"));
        this.mUiRemoteVideoParent.appendChild(video);
    }

    public Ui_OnStartStopButtonClicked = () => {
        if (this.mIsRunning) {

            this.Stop();
        } else {
            this.Start();
        }

    }
    public Ui_OnUpdate = () => {
        console.debug("OnUiUpdate");
        this.mAddress = this.mUiAddress.value;
        this.mMediaConfig.Audio = this.mUiAudio.checked;
        this.mMediaConfig.Video = this.mUiVideo.checked;
        this.mUiUrl.innerHTML = this.GetUrl();
    }

    public Ui_Update(): void {
        console.log("UpdateUi");
        this.mUiAddress.value = this.mAddress;
        this.mUiAudio.checked = this.mMediaConfig.Audio;
        this.mUiVideo.checked = this.mMediaConfig.Video;
        this.mUiUrl.innerHTML = this.GetUrl();
    }


    private GenerateRandomKey() {
        var result = "";
        for (var i = 0; i < 7; i++) {
            result += String.fromCharCode(65 + Math.round(Math.random() * 25));
        }
        return result;
    }
    private GetUrlParams() {
        return "?a=" + this.mAddress + "&audio=" + this.mMediaConfig.Audio + "&video=" + this.mMediaConfig.Video + "&" + "autostart=" + true;
    }
    private GetUrl() {
        return location.protocol + '//' + location.host + location.pathname + this.GetUrlParams();
    }
}
