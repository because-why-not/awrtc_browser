import * as awrtc from "../awrtc/index"

/**
 * Copy of the CallApp to test custom video input
 */
export class VideoInputApp {
    public static sVideoDevice = null;
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
            { urls: "stun:stun.because-why-not.com:443" },
            { urls: "stun:stun.l.google.com:19302" }
        ];
        //use for testing conferences 
        //this.mNetConfig.IsConference = true;
        //this.mNetConfig.SignalingUrl = "wss://signaling.because-why-not.com/testshared";
        this.mNetConfig.IsConference = false;
        this.mNetConfig.SignalingUrl = "wss://signaling.because-why-not.com/callapp";
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





    public Start(address, audio, video): void {
        if (this.mCall != null)
            this.Stop();

        this.mIsRunning = true;
        this.Ui_OnStart()
        console.log("start");
        console.log("Using signaling server url: " + this.mNetConfig.SignalingUrl);

        //create media configuration
        var config = new awrtc.MediaConfig();
        config.Audio = audio;
        config.Video = video;
        config.IdealWidth = 640;
        config.IdealHeight = 480;
        config.IdealFps = 30;
        if (VideoInputApp.sVideoDevice !== null) {
            config.VideoDeviceName = VideoInputApp.sVideoDevice;
        }

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
        this.mCall.Listen(address);

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
    private mAudio;
    private mVideo;
    private mAutostart;
    private mUiAddress: HTMLInputElement;
    private mUiAudio: HTMLInputElement;
    private mUiVideo: HTMLInputElement;
    private mUiButton: HTMLButtonElement;
    private mUiUrl: HTMLElement;
    private mUiLocalVideoParent: HTMLElement;
    private mUiRemoteVideoParent: HTMLElement;

    public setupUi(parent: HTMLElement) {
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
        this.mAudio = this.GetParameterByName("audio");
        this.mAudio = this.tobool(this.mAudio, true)

        this.mVideo = this.GetParameterByName("video");
        this.mVideo = this.tobool(this.mVideo, true);

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
            this.Start(this.mAddress, this.mAudio, this.mVideo);
        }

        console.log("address: " + this.mAddress + " audio: " + this.mAudio + " video: " + this.mVideo + " autostart: " + this.mAutostart);
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
            this.Start(this.mAddress, this.mAudio, this.mVideo);
        }

    }
    public Ui_OnUpdate = () => {
        console.debug("OnUiUpdate");
        this.mAddress = this.mUiAddress.value;
        this.mAudio = this.mUiAudio.checked;
        this.mVideo = this.mUiVideo.checked;
        this.mUiUrl.innerHTML = this.GetUrl();
    }

    public Ui_Update(): void {
        console.log("UpdateUi");
        this.mUiAddress.value = this.mAddress;
        this.mUiAudio.checked = this.mAudio;
        this.mUiVideo.checked = this.mVideo;
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
        return "?a=" + this.mAddress + "&audio=" + this.mAudio + "&video=" + this.mVideo + "&" + "autostart=" + true;
    }
    private GetUrl() {
        return location.protocol + '//' + location.host + location.pathname + this.GetUrlParams();
    }
}


export function videoinputapp(parent: HTMLElement, canvas: HTMLCanvasElement) {
    let callApp: VideoInputApp;
    console.log("init callapp");
    if (parent == null) {
        console.log("parent was null");
        parent = document.body;
    }
    awrtc.SLog.SetLogLevel(awrtc.SLogLevel.Info);
    callApp = new VideoInputApp();
    const media = new awrtc.Media();
    const devname = "canvas";
    awrtc.Media.SharedInstance.VideoInput.AddCanvasDevice(canvas, devname, canvas.width, canvas.height, 30);

    setInterval(() => {
        awrtc.Media.SharedInstance.VideoInput.UpdateFrame(devname);
    }, 50);
    VideoInputApp.sVideoDevice = devname;

    callApp.setupUi(parent);

}
