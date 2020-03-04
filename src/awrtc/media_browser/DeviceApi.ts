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
import { SLog } from "../network/index";
import { MediaConfig } from "media/MediaConfig";
import { VideoInput } from "./VideoInput";

export class DeviceInfo
{
    public deviceId:string = null;
    public defaultLabel:string = null;
    public label:string = null;
    public isLabelGuessed:boolean = true;
}

export interface DeviceApiOnChanged {
    (): void;
}

export class DeviceApi
{
    private static sLastUpdate = 0;
    public static get LastUpdate() :number
    {
        return DeviceApi.sLastUpdate;
    }
    public static get HasInfo()
    {
        return DeviceApi.sLastUpdate > 0;
    }

    private static sIsPending = false;
    public static get IsPending(){
        return DeviceApi.sIsPending;
    }

    private static sLastError:string = null;
    private static get LastError()
    {
        return this.sLastError;
    }


    private static sDeviceInfo: { [id: string] : DeviceInfo; } = {};
    private static sVideoDeviceCounter = 1;
    private static sAccessStream:MediaStream = null;


    private static sUpdateEvents: Array<DeviceApiOnChanged> = [];
    public static AddOnChangedHandler(evt: DeviceApiOnChanged)
    {
        DeviceApi.sUpdateEvents.push(evt);
    }
    public static RemOnChangedHandler(evt: DeviceApiOnChanged)
    {
        let index = DeviceApi.sUpdateEvents.indexOf(evt);
        if(index >= 0)
        {
            DeviceApi.sUpdateEvents.splice(index, 1);
        }else{
            SLog.LW("Tried to remove an unknown event handler in DeviceApi.RemOnChangedHandler");
        }
    }

    private static TriggerChangedEvent()
    {
        for(let v of DeviceApi.sUpdateEvents)
        {
            try{
                v();
            }catch(e)
            {
                SLog.LE("Error in DeviceApi user event handler: " + e);
                console.exception(e);
            }
        }
    }

    private static InternalOnEnum = (devices:MediaDeviceInfo[])=>
    {
        DeviceApi.sIsPending = false;
        DeviceApi.sLastUpdate = new Date().getTime();

        let newDeviceInfo: { [id: string] : DeviceInfo; } = {};
        for(let info of devices)
        {
            if(info.kind != "videoinput")
                continue;
            let newInfo = new DeviceInfo();
            newInfo.deviceId  = info.deviceId;

            let knownInfo:DeviceInfo= null;
            if(newInfo.deviceId in DeviceApi.Devices)
            {
                //known device. reuse the default label
                knownInfo = DeviceApi.Devices[newInfo.deviceId];
            }


            //check if we gave this device a default label already
            //this is used to identify it via a user readable name in case
            //we update multiple times with proper labels / default labels
            if(knownInfo != null)
            {
                newInfo.defaultLabel = knownInfo.defaultLabel;
            }else
            {
                newInfo.defaultLabel = info.kind  + " " + DeviceApi.sVideoDeviceCounter;;
                DeviceApi.sVideoDeviceCounter++;
            }

            //check if we know a proper label or got one this update
            if(knownInfo != null && knownInfo.isLabelGuessed == false)
            {
                //already have one
                newInfo.label = knownInfo.label;
                newInfo.isLabelGuessed = false;
            }else if(info.label)
            {
                //got a new one
                newInfo.label = info.label;
                newInfo.isLabelGuessed = false;
            }else{
                //no known label -> just use the default one
                newInfo.label = newInfo.defaultLabel;
                newInfo.isLabelGuessed = true;
            }
            
            newDeviceInfo[newInfo.deviceId] = newInfo;
        }

        DeviceApi.sDeviceInfo = newDeviceInfo;

        if(DeviceApi.sAccessStream)
        {
            var tracks = DeviceApi.sAccessStream.getTracks();
            for (var i = 0; i < tracks.length; i++) {
                tracks[i].stop();
            }
            DeviceApi.sAccessStream = null;
        }
        DeviceApi.TriggerChangedEvent();
    }

    public static get Devices()
    {
        return DeviceApi.sDeviceInfo;
    }


    public static GetVideoDevices(): string[]{
        const devices = DeviceApi.Devices;
        const keys = Object.keys(devices);
        const labels = keys.map((x)=>{return devices[x].label});
        
        return labels;
    }
    public static Reset()
    {
        DeviceApi.sUpdateEvents = [];
        DeviceApi.sLastUpdate = 0;
        DeviceApi.sDeviceInfo = {};
        DeviceApi.sVideoDeviceCounter = 1;
        DeviceApi.sAccessStream = null;
        DeviceApi.sLastError = null;
        DeviceApi.sIsPending = false;
    }

    private static InternalOnErrorCatch = (err:DOMError)=>
    {
        let txt :string = err.toString();
        DeviceApi.InternalOnErrorString(txt);
    }
    private static InternalOnErrorString = (err:string)=>
    {
        DeviceApi.sIsPending = false;
        DeviceApi.sLastError = err;
        SLog.LE(err);
        DeviceApi.TriggerChangedEvent();
    }

    private static InternalOnStream = (stream:MediaStream)=>
    {
        DeviceApi.sAccessStream = stream;
        DeviceApi.Update();
    }

    static ENUM_FAILED = "Can't access mediaDevices or enumerateDevices";
    /**Updates the device list based on the current
     * access. Gives the devices numbers if the name isn't known.
     */
    public static Update():void
    {
        DeviceApi.sLastError = null;
        if(DeviceApi.IsApiAvailable())
        {
            DeviceApi.sIsPending = true;
            navigator.mediaDevices.enumerateDevices()
            .then(DeviceApi.InternalOnEnum)
            .catch(DeviceApi.InternalOnErrorCatch);
        }else{
            DeviceApi.InternalOnErrorString(DeviceApi.ENUM_FAILED);
        }
    }
    public static async UpdateAsync():Promise<void>
    {
        return new Promise((resolve, fail)=>{

            DeviceApi.sLastError = null;
            if(DeviceApi.IsApiAvailable() == false)
            {
                DeviceApi.InternalOnErrorString(DeviceApi.ENUM_FAILED);
                fail(DeviceApi.ENUM_FAILED);
            }
            resolve();
        }).then(()=>{
            DeviceApi.sIsPending = true;
            return navigator.mediaDevices.enumerateDevices()
            .then(DeviceApi.InternalOnEnum)
            .catch(DeviceApi.InternalOnErrorCatch);
        });
    }
    
    /**Checks if the API is available in the browser.
     * false - browser doesn't support this API
     * true - browser supports the API (might still refuse to give
     * us access later on)
     */
    public static IsApiAvailable():boolean
    {
        if(navigator && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)
            return true;
        return false;
    }
    /**Asks the user for access first to get the full
     * device names.
     */
    public static RequestUpdate():void
    {
        DeviceApi.sLastError = null;
        if(DeviceApi.IsApiAvailable())
        {
            DeviceApi.sIsPending = true;
            let constraints = {video:true};
            navigator.mediaDevices.getUserMedia(constraints)
                .then(DeviceApi.InternalOnStream)
                .catch(DeviceApi.InternalOnErrorCatch);
        }else{
            DeviceApi.InternalOnErrorString("Can't access mediaDevices or enumerateDevices");
        }
    }


    public static GetDeviceId(label:string):string {

        let devs = DeviceApi.Devices;
        for (var key in devs) {
            let dev = devs[key];
            if(dev.label == label || dev.defaultLabel == label || dev.deviceId == label){

                return dev.deviceId; 
            }
        }
        return null;
    }

    public static IsUserMediaAvailable()
    {
        if(navigator && navigator.mediaDevices)
            return true;
        return false;
    }
    

    public static ToConstraints(config: MediaConfig): MediaStreamConstraints
    {
        //ugly part starts -> call get user media data (no typescript support)
        //different browsers have different calls...

        //check  getSupportedConstraints()??? 
        //see https://w3c.github.io/mediacapture-main/getusermedia.html#constrainable-interface

        //set default ideal to very common low 320x240 to avoid overloading weak computers
        var constraints = {
            audio: config.Audio
        } as any;


        
        let width = {} as any;
        let height = {} as any;
        let video = {} as any;
        let fps = {} as any;
        
        if (config.MinWidth != -1)
            width.min = config.MinWidth;

        if (config.MaxWidth != -1)
            width.max = config.MaxWidth;
        
        if (config.IdealWidth != -1)
            width.ideal = config.IdealWidth;
        
        if (config.MinHeight != -1)
            height.min = config.MinHeight;

        if (config.MaxHeight != -1)
            height.max = config.MaxHeight;

        if (config.IdealHeight != -1)
            height.ideal = config.IdealHeight;
        
        
        if (config.MinFps != -1)
            fps.min = config.MinFps;
        if (config.MaxFps != -1)
            fps.max = config.MaxFps;
        if (config.IdealFps != -1)
            fps.ideal = config.IdealFps;
            

        //user requested specific device? get it now to properly add it to the
        //constraints later
        let deviceId:string = null;
        if(config.Video && config.VideoDeviceName && config.VideoDeviceName !== "")
        {
            deviceId = DeviceApi.GetDeviceId(config.VideoDeviceName);
            SLog.L("using device " + config.VideoDeviceName);
            if(deviceId !== null)
            {
                //SLog.L("using device id " + deviceId);
            }
            else{
                SLog.LE("Failed to find deviceId for label " + config.VideoDeviceName);
                throw new Error("Unknown device " + config.VideoDeviceName);
            }
        }
        //watch out: unity changed behaviour and will now
        //give 0 / 1 instead of false/true
        //using === won't work
        if(config.Video == false)
        {
            //video is off
            video = false;
        }else {
            if(Object.keys(width).length > 0){
                video.width = width;
            }
            if(Object.keys(height).length > 0){
                video.height = height;
            }
            if(Object.keys(fps).length > 0){
                video.frameRate = fps;
            }
            if(deviceId !== null){
                video.deviceId = {"exact":deviceId};
            }
            
            //if we didn't add anything we need to set it to true
            //at least (I assume?)
            if(Object.keys(video).length == 0){
                video = true;
            }
        }


        constraints.video = video;
        return constraints;
    }

    public static getBrowserUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>{

        return navigator.mediaDevices.getUserMedia(constraints);
    }
    public static getAssetUserMedia(config: MediaConfig): Promise<MediaStream>{
        return new Promise((resolve)=>{
            const res = DeviceApi.ToConstraints(config);
            resolve(res);
        }).then((constraints)=>{
            return DeviceApi.getBrowserUserMedia(constraints as MediaStreamConstraints);
        });        
    }

}