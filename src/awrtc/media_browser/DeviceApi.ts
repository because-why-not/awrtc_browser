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


export class MediaDevice
{
    //unique id
    public Id: string = null;
    //user readable name. Either defaultLabel or an exact name if available
    public Name: string = null;
}
class DeviceInfoInternal extends MediaDevice
{
    //this is a guessed label for the device. e.g. videoinput 1 if full device information
    //wasn't available yet. This will be kept the same even when MediaDevice.Name is updated
    //to allow the UI to reuse old values
    public fallbackLabel: string = null;
    
    //True if the label is a generic name. False if it contains an exact device name
    public isLabelGuessed: boolean = true;
    //type of the device
    public kind: MediaDeviceKind;
}

export interface DeviceApiOnChanged {
    (): void;
}

//Dictionary to keep device information. Device id is returned as key
//watch out: These must not contain audio and video input as browsers 
//use the same id for a video and audio device
type DeviceDictionary = { [id: string]: DeviceInfoInternal; };
/**This keeps the device information we collected and
 * allows addressing devices with just a string (not just an id) 
 * to keep the API consistant with the other platforms that lack
 * access to unique ID's.
 */
class DeviceDb {
    public mDeviceInfo: DeviceDictionary = {};
    public mDeviceCounter = 1;

    
    public get DeviceDict() : DeviceDictionary
    {
        return this.mDeviceInfo;
    }

    //Returns a string list of all device labels / names. 
    //This is for the compatibility to old platforms (will be removed one day)
    public GetDeviceLabels() : string[]
    {
        const labels = Object.values(this.mDeviceInfo).map((x)=> x.Name);
        return labels;
    }
    //Returns a list of all devices with id and label. Replaces GetDeviceLabels
    public GetDeviceList(): MediaDevice[]{
        const devs = Object.values(this.mDeviceInfo);
        return devs;
    }
    //Updates the internal device list. Keeps track of id, label and guessed labels in case the
    //actual label is not known yet
    public UpdateDeviceList(devices: MediaDeviceInfo[]) {
        
        let newDeviceInfo: DeviceDictionary = {};
        for(let info of devices)
        {
            let newInfo = new DeviceInfoInternal();
            newInfo.Id = info.deviceId;
            newInfo.kind = info.kind;

            let oldKnownInfo: DeviceInfoInternal = null;
            //if we already know a device with that id get the info
            if(newInfo.Id in this.mDeviceInfo)
            {
                oldKnownInfo = this.mDeviceInfo[newInfo.Id];
            }

            //reuse the old defaultLabel or create a new one
            if(oldKnownInfo != null)
            {
                newInfo.fallbackLabel = oldKnownInfo.fallbackLabel;
            }else
            {
                newInfo.fallbackLabel = info.kind  + " " + this.mDeviceCounter;
                this.mDeviceCounter++;
            }

            //check if we know a proper label or got one this update
            if(oldKnownInfo != null && oldKnownInfo.isLabelGuessed == false)
            {
                //we already have the label -> reuse it
                newInfo.Name = oldKnownInfo.Name;
                newInfo.isLabelGuessed = false;
            }else if(info.label)
            {
                //we got a new label -> use this instead of the old one
                newInfo.Name = info.label;
                newInfo.isLabelGuessed = false;
            }else{
                //no known label -> use the fallback label we set earlier
                newInfo.Name = newInfo.fallbackLabel;
                newInfo.isLabelGuessed = true;
            }
            
            newDeviceInfo[newInfo.Id] = newInfo;
        }
        
        this.mDeviceInfo = newDeviceInfo;
    }
}
export class DeviceApi
{
    static ENUM_FAILED = "Can't access mediaDevices or enumerateDevices";
    
    private static sVideoDeviceInfo: DeviceDb = new DeviceDb();
    private static sAudioInputDeviceInfo: DeviceDb = new DeviceDb();
    private static sAccessStream:MediaStream = null;
    private static sLastUpdate = 0;

    /**
     * Returns time in ms when the device list was last updated
     */
    public static get LastUpdate() :number
    {
        return DeviceApi.sLastUpdate;
    }
    /** True if the device list was updated at least once
     * 
     */
    public static get HasInfo(): boolean
    {
        return DeviceApi.sLastUpdate > 0;
    }

    private static sIsPending = false;
    /** True if a device list was requiested
     * but the results are not yet available
     */
    public static get IsPending(){
        return DeviceApi.sIsPending;
    }

    private static sLastError:string = null;
    /** Returns the last error detected
     * 
     */
    private static get LastError()
    {
        return this.sLastError;
    }




    /**List of event handlers that are triggered when
     * the device list was updated
     */
    private static sUpdateEvents: Array<DeviceApiOnChanged> = [];
    
    /** Adds a new event handler
     * 
     * @param evt 
     */
    public static AddOnChangedHandler(evt: DeviceApiOnChanged)
    {
        DeviceApi.sUpdateEvents.push(evt);
    }
    /** Removes an event handler
     * 
     * @param evt 
     */
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
                console.error(e);
            }
        }
    }



    private static InternalOnEnum = (devices:MediaDeviceInfo[])=>
    {
        DeviceApi.sIsPending = false;
        DeviceApi.sLastUpdate = new Date().getTime();

        const videoInputDevices = devices.filter((x) => x.kind == "videoinput");
        const audioInputDevices = devices.filter((x) => x.kind == "audioinput");

        DeviceApi.sVideoDeviceInfo.UpdateDeviceList(videoInputDevices);
        DeviceApi.sAudioInputDeviceInfo.UpdateDeviceList(audioInputDevices);

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

    public static get VideoDevices() : DeviceDictionary
    {
        return DeviceApi.sVideoDeviceInfo.DeviceDict;
    }

    public static GetVideoDevices(): string[]{
        return DeviceApi.sVideoDeviceInfo.GetDeviceLabels();
    }

    public static GetVideoInputDevices(): MediaDevice[]{
        return DeviceApi.sVideoDeviceInfo.GetDeviceList();
    }
    public static GetAudioInputDevices(): MediaDevice[]{
        return DeviceApi.sAudioInputDeviceInfo.GetDeviceList();
    }
    

    public static Reset()
    {
        DeviceApi.sUpdateEvents = [];
        DeviceApi.sLastUpdate = 0;
        DeviceApi.sVideoDeviceInfo = new DeviceDb();
        DeviceApi.sAudioInputDeviceInfo = new DeviceDb();
        DeviceApi.sAccessStream = null;
        DeviceApi.sLastError = null;
        DeviceApi.sIsPending = false;
    }

    private static InternalOnErrorCatch = (err:any)=>
    {
        DeviceApi.InternalOnErrorString(JSON.stringify(err));
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
    /**Updates the device list and allows to wait until the results
     * are available
     * 
     * @returns 
     */
    public static async UpdateAsync():Promise<void>
    {
        return new Promise<void>((resolve, fail)=>{

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

        let devs = DeviceApi.VideoDevices;
        for (var key in devs) {
            let dev = devs[key];
            if(dev.Name == label || dev.fallbackLabel == label || dev.Id == label){

                return dev.Id; 
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
    
    //translates our cross-platform MediaConfig to MediaStreamConstraints
    public static ToConstraints(config: MediaConfig): MediaStreamConstraints
    {
        
        var constraints = {
            audio: config.Audio
        } as any;
        if (config.Audio && config.AudioInputDevice) {
            constraints.audio = {deviceId: {exact:config.AudioInputDevice}};
        }


        
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
            if(deviceId === "")
            {
                //Workaround for Chrome 81: If no camera access is allowed chrome returns the deviceId ""
                //thus we can only request any video device. We can't select a specific one
                deviceId = null;
            }else if(deviceId !== null)
            {
                //all good
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
    
    public static async getBrowserUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>{

        /**There appears to be a Chrome big in version 121 and likely earlier. 
         * that triggers an exception "DOMException: Could not start video source"
         * when used with our default values on the first attempt when vising a webpage. 
         * 
         * Reproduce with:
        setTimeout(async () => {
            await navigator.mediaDevices.getUserMedia(
                {
                    audio: true,
                    video:
                    {
                        width:
                        {
                            ideal: 1280
                        },
                        height:
                        {
                            ideal: 720
                        }
                    }
                })
        }, 1);
            happens only if the default video device does not support a resolution of 1280x720
            It works fine on the second attempt after the user allowed camera and we can
            attach a deviceId to the constraints.
         */
        const res = await navigator.mediaDevices.getUserMedia(constraints);
        //after calling getUserMedia the browsers give us more accurate device names
        //buffer names now for any future synchronous access
        DeviceApi.Update();
        return res;
    }

    //similar to the browsers user media but with some added workarounds to
    //support cross platform compatibility (e.g. using -1 for unset values)
    public static async getAssetUserMedia(config: MediaConfig): Promise<MediaStream>{
        
        const constraints = DeviceApi.ToConstraints(config);
        const result = await DeviceApi.getBrowserUserMedia(constraints);
        return result;
    }

}