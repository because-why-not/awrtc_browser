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

import * as awrtc from "../awrtc/index"
import { DeviceApi, Media, MediaConfig, WebRtcHelper } from "../awrtc/index";

/**
 * Main (and most complicated) example for using BrowserWebRtcCall.
 * Have a look at examples.html for easier scenarios.
 * 
 * 
 * 
 * Features:
 * - Build a "Join" system on top of the regular Listen / Call model to make it easier to use. 
 * - basic user interface (This is for easy testing not for use as a final application!!! Write your own using the API)
 * - setup to be compatible with the Unity Asset's CallApp (but without TURN server!)
 * - Get parameters from the address line to configure the call
 * - autostart the call (this might not work in all browsers. Mostly used for testing)
 */
export class CallApp
{
    private mAddress;
    private mNetConfig = new awrtc.NetworkConfig();
    private mCall : awrtc.BrowserWebRtcCall = null;
    
    //update loop
    private mIntervalId:any = -1;

    private mLocalVideo: HTMLVideoElement = null;
    private mRemoteVideo = {};
    
    private mIsRunning = false;
    //true on startup, false once first config completed and connection attempts are made
    private mWaitForInitialConfig = true;

    private mAutoRejoin = true;


    public constructor()
    {
        this.mNetConfig.IceServers = [ 
            {urls: "stun:t.y-not.app:443"},
            //{urls: "turn:t.y-not.app:443", username: "user", credential:"pass"},
            {urls: "stun:stun.l.google.com:19302"}
        ];
        this.mNetConfig.IsConference = false;
        this.mNetConfig.SignalingUrl = "wss://s.y-not.app/callapp";
        //uncommenting this will make the callapp incompatible to the default configuration!
        //(new connection will immediately disconnect again after being established)
        //this.mNetConfig.KeepSignalingAlive = true;
        //this.mNetConfig.MaxIceRestart = 2;
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
    private tobool(value, defaultval)
    {
        if(value === true || value === "true")
            return true;
        if(value === false || value === "false")
            return false;
    
        return defaultval;
    }
    
    


    public Start() : void
    {
        if(this.mCall != null)
            this.Cleanup();

        
        
        this.UI_UiToValues();
        
        
        /*
        this.mMediaConfig.VideoCodecs = ["H264", "VP9"];
        this.mMediaConfig.VideoBitrateKbits = 50000;
        this.mMediaConfig.VideoContentHint = "detail";
        */
        
        this.mIsRunning = true;
        
        this.Ui_OnStart()
        console.log("start");
        console.log("Using signaling server url: " + this.mNetConfig.SignalingUrl);

        //create media configuration
        
        
        //For usage in HTML set FrameUpdates to false and wait for  MediaUpdate to
        //get the VideoElement. By default awrtc would deliver frames individually
        //for use in Unity WebGL
        console.log("requesting config:" + JSON.stringify(this.mMediaConfig));
        //setup our high level call class.
        this.mCall = new awrtc.BrowserWebRtcCall(this.mNetConfig);

        //handle events (get triggered after Configure / Listen call)
        //+ugly lambda to avoid loosing "this" reference
        this.mCall.addEventListener((sender, args)=>{
            this.OnNetworkEvent(sender, args);
        });



        //As the system is designed for realtime graphics we have to call the Update method. Events are only
        //triggered during this Update call!
        this.mIntervalId = setInterval(()=>{
            this.Update();
        }, 50);

        
        this.mWaitForInitialConfig = true;
        //configure media. This will request access to media and can fail if the user doesn't have a proper device or
        //blocks access
        this.mCall.Configure(this.mMediaConfig);
        
        //Now we wait for the "ConfigurationComplete" event to continue

    }

    public Reconfigure(new_config:MediaConfig) {

        const old_config = this.mMediaConfig;
        this.mMediaConfig = new_config;
        if (this.mCall !== null)
        {
            console.log("Trigger reconfigure from " + old_config.toString());
            console.log("to " + new_config.toString());
            this.mCall.Configure(this.mMediaConfig);
        }
    }

    
    
    public Stop(): void
    {
        this.Cleanup();
    }

    
    private CheckAutoRejoin() {
        if (this.mAutoRejoin) {
            setTimeout(() => {
                if (this.mIsRunning === false) {
                    this.Start();
                }
            }, 1000);
        }
    }

    private Cleanup():void{

        if(this.mCall != null)
        {
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

    private Update():void
    {
        if(this.mCall != null)
            this.mCall.Update();
    }

    private OnNetworkEvent(sender: any, args: awrtc.CallEventArgs):void{

        //User gave access to requested camera/ microphone
        if (args.Type == awrtc.CallEventType.ConfigurationComplete){
            console.log("configuration complete");

            
            if (this.mWaitForInitialConfig) {
                //Try to listen to the address 
                //Conference mode = everyone listening will connect to each other
                //Call mode -> If the address is free it will wait for someone else to connect
                //          -> If the address is used then it will fail to listen and then try to connect via Call(address);
                console.log(`Attempt to listen on ${this.mAddress}`);
                this.mCall.Listen(this.mAddress);
            }
            this.mWaitForInitialConfig = false; 
        }
        else if (args.Type == awrtc.CallEventType.MediaUpdate) {
            
            let margs = args as awrtc.MediaUpdatedEventArgs;
            if (margs.ConnectionId == awrtc.ConnectionId.INVALID) {

                var videoElement = margs.VideoElement;
                
                this.Ui_OnLocalVideo(videoElement);
                console.log("local video added resolution:" + videoElement.videoWidth  + videoElement.videoHeight + " fps: ??");
            }
            else {
                
                var videoElement = margs.VideoElement;
                this.Ui_OnRemoteVideo(videoElement, margs.ConnectionId);
                console.log("remote video added resolution:" + videoElement.videoWidth  + "x" + videoElement.videoHeight + " fps: ??");
            }
        }
        else if (args.Type == awrtc.CallEventType.ListeningFailed) {
            //First attempt of this example is to try to listen on a certain address
            //for conference calls this should always work (expect the internet is dead)
            if (this.mNetConfig.IsConference == false) {
                //no conference call and listening failed? someone might have claimed the address.
                //Try to connect to existing call
                console.log(`Attempt to call ${this.mAddress}`);
                this.mCall.Call(this.mAddress);
            }
            else {
                let errorMsg = "Listening failed. Offline? Server dead?";
                console.error(errorMsg);
                this.Ui_OnError(errorMsg);
                this.Cleanup();
                this.CheckAutoRejoin();
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
            this.CheckAutoRejoin();
            return;
        }
        else if (args.Type == awrtc.CallEventType.CallEnded) {
            //call ended or was disconnected
            var callEndedEvent = args as awrtc.CallEndedEventArgs;
            console.log("call ended with id " + callEndedEvent.ConnectionId.id);
            delete this.mRemoteVideo[callEndedEvent.ConnectionId.id];
            this.Ui_OnLog("Disconnected from user with id " + callEndedEvent.ConnectionId.id);
            //check if this was the last user
            if(this.mNetConfig.IsConference == false && Object.keys(this.mRemoteVideo).length == 0)
            {
                //1 to 1 call and only user left -> quit
                this.Cleanup();
                this.CheckAutoRejoin();
                return;
            }
        }
        else if (args.Type == awrtc.CallEventType.Message) {
            
            let messageArgs = args as awrtc.MessageEventArgs;
            let type = "unreliable";
            if (messageArgs.Reliable) {
                type = "reliable"
            }
            console.warn(`Message from ${messageArgs.ConnectionId.id} via ${type} dc received: ${messageArgs.Content} `);
            //this.mCall.Send(messageArgs.Content, messageArgs.Reliable, messageArgs.ConnectionId);
        }
        else if (args.Type == awrtc.CallEventType.DataMessage) {
            let messageArgs = args as awrtc.DataMessageEventArgs;
            //this.mCall.SendData(messageArgs.Content, messageArgs.Reliable, messageArgs.ConnectionId);
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
    private mMediaConfig : MediaConfig;
    private mAutostart;
    private mUiAddress: HTMLInputElement;
    private mUiAudio: HTMLInputElement;
    private mUiVideo: HTMLInputElement;
    private mUiVideoDevices: HTMLSelectElement;
    private mUiAudioInputDevices: HTMLSelectElement;
    private mUiWidth: HTMLInputElement;
    private mUiHeight: HTMLInputElement;
    private mUiButton: HTMLButtonElement;
    private mUiUrl: HTMLElement;
    private mUiLocalVideoParent: HTMLElement;
    private mUiRemoteVideoParent: HTMLElement;

    public setupUi(parent : HTMLElement)
    {
        this.mMediaConfig = new MediaConfig();


        
        let devname = "Screen capture";
        Media.SharedInstance.EnableScreenCapture(devname, true);

        this.mUiAddress = parent.querySelector<HTMLInputElement>(".callapp_address");
        this.mUiAudio = parent.querySelector<HTMLInputElement>(".callapp_send_audio");
        this.mUiVideo = parent.querySelector<HTMLInputElement>(".callapp_send_video");
        this.mUiWidth =  parent.querySelector<HTMLInputElement>(".callapp_width");
        this.mUiHeight = parent.querySelector<HTMLInputElement>(".callapp_height");
        this.mUiVideoDevices = parent.querySelector<HTMLSelectElement>(".video_devices");        
        this.mUiVideoDevices.addEventListener('change', () => {
            this.UI_OnDeviceUpdate();
        });
        this.mUiAudioInputDevices = parent.querySelector<HTMLSelectElement>(".audio_input_devices");        
        this.mUiAudioInputDevices.addEventListener('change', () => {
            this.UI_OnDeviceUpdate();
        });
        this.UI_UpdateDevices();

        this.mUiUrl = parent.querySelector<HTMLParagraphElement>(".callapp_url");
        this.mUiButton = parent.querySelector<HTMLButtonElement>(".callapp_button");
        this.mUiLocalVideoParent =  parent.querySelector<HTMLParagraphElement>(".callapp_local_video");
        this.mUiRemoteVideoParent =  parent.querySelector<HTMLParagraphElement>(".callapp_remote_video");
        this.mUiAudio.onclick = this.Ui_OnUpdate;
        this.mUiVideo.onclick = this.Ui_OnUpdate;
        this.mUiAddress.onkeyup = this.Ui_OnUpdate;
        this.mUiButton.onclick = this.Ui_OnStartStopButtonClicked;
        
        
        this.UI_ParameterToUi();
        this.UI_UiToValues();


        //if autostart is set but no address is given -> create one and reopen the page
        if (this.mAddress === null && this.mAutostart == true) {
            this.mAddress = this.GenerateRandomKey();
            window.location.href = this.GetUrlParams();
        }
        else
        {  
            if(this.mAddress === null)
                this.mAddress = this.GenerateRandomKey();
                this.Ui_ValuesToUi();
        }

        //used for interacting with the Unity CallApp

        //current hack to get the html element delivered. by default this
        //just the image is copied and given as array
        //Lazy frames will be the default soon though


        if(this.mAutostart)
        {
            console.log("Starting automatically ... ")
            this.Start(); 
        } 

        console.log(`setupUi: address: ${this.mAddress} + audio: ${this.mMediaConfig.Audio} video: ${ this.mMediaConfig.Video } autostart: ${ this.mAutostart }`);
    }
    private Ui_OnStart(){
        this.mUiButton.textContent = "Stop";
    }
    private Ui_OnCleanup()
    {
        this.mUiButton.textContent = "Join";
        while (this.mUiLocalVideoParent.hasChildNodes()) {   
            this.mUiLocalVideoParent.removeChild(this.mUiLocalVideoParent.firstChild);
        }
        while (this.mUiRemoteVideoParent.hasChildNodes()) {   
            this.mUiRemoteVideoParent.removeChild(this.mUiRemoteVideoParent.firstChild);
        }

        this.UI_UpdateDevices();
    }
    private Ui_OnLog(msg:string){

    }
    private Ui_OnError(msg:string){

    }
    private Ui_OnLocalVideo(video_element: HTMLVideoElement) {
        
        if (this.mLocalVideo != null) {
            //This is currently done within MediaStream to ensure
            //memory doesn't leak
            //remove old video
            //this.mUiLocalVideoParent.removeChild(this.mLocalVideo);
        }

        if (video_element !== null) {
            video_element.setAttribute("width", "100%")
            video_element.setAttribute("height", "100%")
            this.mUiLocalVideoParent.appendChild(video_element);
        }
        this.mLocalVideo = video_element;
    }

    private Ui_OnRemoteVideo(video: HTMLVideoElement, id: awrtc.ConnectionId) {
        
        if (id.id in this.mRemoteVideo) {
            const old_video = this.mRemoteVideo[id.id];
            //this.mUiRemoteVideoParent.removeChild(old_video);
            delete this.mRemoteVideo[id.id];
        }
        this.mRemoteVideo[id.id] = video;
        video.setAttribute("width", "100%")
        video.setAttribute("height", "100%")
        this.mUiRemoteVideoParent.appendChild(video);
    }

    public Ui_OnStartStopButtonClicked = ()=>{
        if(this.mIsRunning) {

            this.Stop();
        }else{
            this.Start();
        }

    }
    
    private UI_ParameterToUi() {
        
        this.mUiAudio.checked = this.tobool(this.GetParameterByName("audio") , true)
        this.mUiVideo.checked  = this.tobool(this.GetParameterByName("video") , true);
        let width = this.GetParameterByName("width");
        if(width)
            this.mUiWidth.value = width;

        let height = this.GetParameterByName("height");
        if(height)
            this.mUiHeight.value = height;
        
            
        this.mUiAddress.value = this.GetParameterByName("a");

        this.mAutostart = this.GetParameterByName("autostart");
        this.mAutostart = this.tobool(this.mAutostart, false);
    }

    private static UI_UpdateVideoSelect(devices: string[], select: HTMLSelectElement) {
        
        const selectedIndex = select.selectedIndex;
        //clear
        select.innerHTML = '';
        
        devices.forEach(x => {
            const opt = document.createElement("option");
            opt.text = x;
            opt.value = x;
            select.add(opt);
        });
        if(selectedIndex !== -1 && selectedIndex < select.options.length)
        {
            select.selectedIndex = selectedIndex;
        } else {
            select.selectedIndex = 0;
        }
    }
    private static UI_UpdateSelect(devices: awrtc.MediaDevice[], select: HTMLSelectElement) {
        
        const selectedIndex = select.selectedIndex;
        //clear
        select.innerHTML = '';
        
        devices.forEach(x => {
            const opt = document.createElement("option");
            opt.text = x.Name;
            opt.value = x.Id;
            select.add(opt);
        });
        if(selectedIndex !== -1 && selectedIndex < select.options.length)
        {
            select.selectedIndex = selectedIndex;
        } else {
            select.selectedIndex = 0;
        }
    }
    
    public UI_UpdateDevices() {
        
        DeviceApi.UpdateAsync().then(() => { 
            let devices = Media.SharedInstance.GetVideoDevices()
            CallApp.UI_UpdateVideoSelect(devices, this.mUiVideoDevices);

            let audioInputDevices = Media.SharedInstance.GetAudioInputDevices();
            CallApp.UI_UpdateSelect(audioInputDevices, this.mUiAudioInputDevices);

        });
    }
    public UI_GetVideoDevice() : string{
        const index = this.mUiVideoDevices.selectedIndex;
        if (index === -1 || index >= this.mUiVideoDevices.options.length)
            return null;
        const name = this.mUiVideoDevices.options[index].value;
        return name;
    }
    private UI_OnDeviceUpdate() {
        if (this.mIsRunning) {
            this.UI_UiToValues();
        }
    }
    
    public UI_GetAudioInput() : string{
        const index = this.mUiAudioInputDevices.selectedIndex;
        if (index === -1 || index >= this.mUiAudioInputDevices.options.length)
            return null;
        const name = this.mUiAudioInputDevices.options[index].value;
        return name;
    }

    //UI to values
    public Ui_OnUpdate = ()=>
    {
        console.debug("OnUiUpdate");
        this.UI_UiToValues();
    }

    
    private UI_ParseRes(element: HTMLInputElement){
        if(element)
        {
            let val = Math.floor(element.value as any);
            if(val > 0)
                return val;
        }
        return -1;
    }
    private UI_UiToValues(){
        this.mAddress = this.mUiAddress.value;

        let newConfig = this.mMediaConfig.clone();

        newConfig.Audio  = this.mUiAudio.checked;
        newConfig.Video  = this.mUiVideo.checked;
        newConfig.VideoDeviceName = this.UI_GetVideoDevice(); 
        newConfig.AudioInputDevice = this.UI_GetAudioInput(); 


        newConfig.IdealWidth = this.UI_ParseRes(this.mUiWidth);
        newConfig.IdealHeight = this.UI_ParseRes(this.mUiHeight);

        this.Reconfigure(newConfig);

        this.mUiUrl.innerHTML = this.ValuesToParameter();
    }
    //Values to UI
    public Ui_ValuesToUi() : void
    {
        console.log("UpdateUi");
        this.mUiAddress.value = this.mAddress;
        this.mUiAudio.checked = this.mMediaConfig.Audio;
        this.mUiVideo.checked = this.mMediaConfig.Video;
        this.mUiWidth.value = "";
        if(this.mMediaConfig.IdealWidth > 0)
            this.mUiWidth.value = ""+this.mMediaConfig.IdealWidth;
        
        this.mUiHeight.value = "";
        if(this.mMediaConfig.IdealHeight > 0)
            this.mUiHeight.value = ""+this.mMediaConfig.IdealHeight;
                
        this.mUiUrl.innerHTML = this.ValuesToParameter();
    }

    
    private GenerateRandomKey() {
        var result = "";
        for (var i = 0; i < 7; i++) {
            result += String.fromCharCode(65 + Math.round(Math.random() * 25));
        }
        return result;
    }
    private GetUrlParams() {
        return "?a=" + this.mAddress + "&audio=" + this.mMediaConfig.Audio  + "&video=" + this.mMediaConfig.Video  + "&" + "autostart=" + false;
    }
    private ValuesToParameter() {
        return location.protocol + '//' + location.host + location.pathname + this.GetUrlParams();
    }
}

//We use this to test autoplay issues when used with Unity WebGL. In practise a browser app can just show a
//button / UI
function InitAutoplayWorkaround(){
    console.log("registering handler");
    let listener : ()=>void = null;
    listener = ()=>{
        awrtc.SLog.LW("Trying to resolve autoplay issues.");
        //called during user input event
        awrtc.AutoplayResolver.Resolve();
        if (awrtc.AutoplayResolver.HasCompleted() === true) {
            document.removeEventListener("click", listener);
            document.removeEventListener("touchend", listener);
        }
    };
    //If a stream runs into autoplay issues we add a listener for the next on click / touchstart event
    //and resolve it on the next incoming event
    awrtc.AutoplayResolver.onautoplayblocked = () => {
        awrtc.SLog.LW("The browser blocked playback of a video stream.");
        document.addEventListener("click", listener);
        document.addEventListener("touchend", listener);
    };
}


export function callapp(parent: HTMLElement)
{

    WebRtcHelper.EmitAdapter();
    let callApp : CallApp;
    console.log("init callapp");
    if(parent == null)
    {
        console.log("parent was null");
        parent = document.body;
    }
    awrtc.SLog.SetLogLevel(awrtc.SLogLevel.Info);
    callApp = new CallApp();
    callApp.setupUi(parent);
    InitAutoplayWorkaround();
    
}
