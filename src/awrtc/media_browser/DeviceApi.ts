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
            DeviceApi.sUpdateEvents.splice(index, 1);
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
            DeviceApi.sAccessStream.stop();
            DeviceApi.sAccessStream = null;
        }
        DeviceApi.TriggerChangedEvent();
    }

    public static get Devices()
    {
        return DeviceApi.sDeviceInfo;
    }
    public static Reset()
    {
        DeviceApi.sUpdateEvents = [];
        DeviceApi.sLastUpdate = 0;
        DeviceApi.sDeviceInfo = {};
        DeviceApi.sVideoDeviceCounter = 1;
        DeviceApi.sAccessStream = null;
    }

    private static InternalOnError = (err:DOMError)=>
    {
        SLog.LE(err);
    }

    private static InternalOnStream = (stream:MediaStream)=>
    {
        DeviceApi.sAccessStream = stream;
        DeviceApi.Update();
    }


    /**Updates the device list based on the current
     * access. Given devices numbers if the name isn't known.
     */
    public static Update():void
    {
        navigator.mediaDevices.enumerateDevices()
        .then(DeviceApi.InternalOnEnum)
        .catch(DeviceApi.InternalOnError);
    }

    /**Asks the user for access first to get the full
     * device names.
     */
    public static RequestUpdate():void
    {
        let constraints = {video:true};
        navigator.mediaDevices.getUserMedia(constraints)
        .then(DeviceApi.InternalOnStream)
        .catch(DeviceApi.InternalOnError);
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
}