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
//current setup needs to load everything as a module
import {DeviceApi, CAPI_DeviceApi_Update, 
    CAPI_DeviceApi_RequestUpdate, CAPI_Media_GetVideoDevices_Length, 
    CAPI_Media_GetVideoDevices,
    MediaConfig,
    Media} from "../awrtc/index"

export function DeviceApiTest_export()
{


}
describe("DeviceApiTest", () => {

    beforeEach(()=>{
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
        DeviceApi.Reset();
    });

    function printall()
    {
        console.log("current DeviceApi.Devices:");
        for(let k in DeviceApi.Devices)
        {
            let v = DeviceApi.Devices[k];
            console.log(v.deviceId + " defaultLabel:" + v.defaultLabel + " label:" + v.label + " guessed:" + v.isLabelGuessed);
        }
    }

    it("update", (done) => {

        let update1complete = false;
        let update2complete = false;

        let deviceCount = 0;
        expect(Object.keys(DeviceApi.Devices).length).toBe(0);
        //first without device labels
        let updatecall1 = ()=>{
            expect(update1complete).toBe(false);
            expect(update2complete).toBe(false);
            console.debug("updatecall1");
            printall();
            let devices1 = DeviceApi.Devices;
            deviceCount = Object.keys(devices1).length;
            expect(deviceCount).toBeGreaterThan(0);
            let key1 = Object.keys(devices1)[0];

            //these tests don't work anymore due to forcing permissions for devices in
            //unit tests. 
            //In a real browser we don't have access to device names until GetUserMedia
            //returned. Meaning the API will fill in the names using "videoinput 1"
            //"videoinput 2" and so on. 
            //Now the tests force permissions = true so we already have full
            //access at the start
            /*
            expect(devices1[key1].label).toBe("videoinput 1");
            expect(devices1[key1].isLabelGuessed).toBe(true);
            if(deviceCount > 1)
            {
                let key2 = Object.keys(devices1)[1];
                expect(devices1[key2].label).toBe("videoinput 2");
                expect(devices1[key2].isLabelGuessed).toBe(true);
            }
            */
            

            DeviceApi.RemOnChangedHandler(updatecall1);

            //second call with device labels
            let updatecall2 = ()=>{
                console.debug("updatecall2");
                printall();
                //check if the handler work properly
                expect(update1complete).toBe(true);
                expect(update2complete).toBe(false);

                //sadly can't simulate fixed device names for testing
                let devices2 = DeviceApi.Devices;
                expect(Object.keys(devices2).length).toBe(deviceCount);
                let key2 = Object.keys(devices2)[0];
                //should have original label now
                expect(devices2[key1].label).not.toBe("videodevice 1");
                //and not be guessed anymore
                expect(devices2[key1].isLabelGuessed).toBe(false, "Chrome fails this now. Likely due to file://. Check for better test setup");
                update2complete = true;

                DeviceApi.Reset();
                expect(Object.keys(DeviceApi.Devices).length).toBe(0);

                done();
            }
            update1complete = true;
            DeviceApi.AddOnChangedHandler(updatecall2);
            DeviceApi.RequestUpdate();

        };
        DeviceApi.AddOnChangedHandler(updatecall1);
        DeviceApi.Update();
    });
    

    it("capi_update", (done) => {

        let update1complete = false;
        let update2complete = false;

        let deviceCount = 0;
        const devices_length_unitialized = CAPI_Media_GetVideoDevices_Length();
        expect(devices_length_unitialized).toBe(0);
        DeviceApi.AddOnChangedHandler(()=>{

            let dev_length = CAPI_Media_GetVideoDevices_Length();
            expect(dev_length).not.toBe(0);
            expect(dev_length).toBe(Object.keys(DeviceApi.Devices).length);
            
            let keys = Object.keys(DeviceApi.Devices);
            let counter = 0;
            for(let k of keys)
            {
                let expectedVal = DeviceApi.Devices[k].label;
                let actual = CAPI_Media_GetVideoDevices(counter);

                expect(actual).toBe(expectedVal);
                counter++;
            }
            done();
        });
        CAPI_DeviceApi_Update();
    });



    
    it("isMediaAvailable", () => {

        const res = DeviceApi.IsUserMediaAvailable();
        expect(res).toBe(true);
    });
    it("getUserMedia", async () => {

        let stream = await DeviceApi.getBrowserUserMedia({audio:true});
        expect(stream).not.toBeNull();
        expect(stream.getVideoTracks().length).toBe(0);
        expect(stream.getAudioTracks().length).toBe(1);
        stream = await DeviceApi.getBrowserUserMedia({video:true});
        expect(stream).not.toBeNull();
        expect(stream.getAudioTracks().length).toBe(0);
        expect(stream.getVideoTracks().length).toBe(1);
    });
    it("getAssetMedia", async () => {

        let config = new MediaConfig();
        config.Audio = true;
        config.Video = false;
        let stream = await DeviceApi.getAssetUserMedia(config);
        expect(stream).not.toBeNull();
        expect(stream.getVideoTracks().length).toBe(0);
        expect(stream.getAudioTracks().length).toBe(1);
        config = new MediaConfig();
        config.Audio = false;
        config.Video = true;
        stream = await DeviceApi.getAssetUserMedia(config);
        expect(stream).not.toBeNull();
        expect(stream.getAudioTracks().length).toBe(0);
        expect(stream.getVideoTracks().length).toBe(1);
    });

    it("getAssetMedia_invalid", async () => {

        let config = new MediaConfig();
        config.Audio = false;
        config.Video = true;
        config.VideoDeviceName = "invalid name"
        let error = null;
        let stream :MediaStream = null;
        console.log("Expecting error message: Failed to find deviceId for label invalid name");
        try
        {
            stream = await DeviceApi.getAssetUserMedia(config);
        }catch(err){
            error = err;
        }
        expect(stream).toBeNull();
        expect(error).toBeTruthy();
    });

    //check for a specific bug causing promise catch not to trigger correctly
    //due to error in ToConstraints
    it("getAssetMedia_invalid_promise", (done) => {

        let config = new MediaConfig();
        config.Audio = false;
        config.Video = true;
        config.VideoDeviceName = "invalid name"
        
        let result: Promise<MediaStream> = null;
        result = DeviceApi.getAssetUserMedia(config);
        result.then(()=>{
            fail("getAssetUserMedia returned but was expected to fail");
        }).catch((error)=>{
            expect(error).toBeTruthy();
            done();
        })
    });

    it("UpdateAsync", async (done) => {
        
        expect(DeviceApi.GetVideoDevices().length).toBe(0);
        await DeviceApi.UpdateAsync();
        expect(DeviceApi.GetVideoDevices().length).toBeGreaterThan(0);
        expect(DeviceApi.GetVideoDevices().length).toBe(CAPI_Media_GetVideoDevices_Length());
        
        done();
    });
    
    /*
    it("Devices", async () => {

        DeviceApi.RequestUpdate

        let config = new MediaConfig();
        config.Audio = false;
        config.Video = true;
        config.VideoDeviceName = "invalid name"
        let error = null;
        let stream :MediaStream = null;
        console.log("Expecting error message: Failed to find deviceId for label invalid name");
        try
        {
            stream = await DeviceApi.getAssetUserMedia(config);
        }catch(err){
            error = err;
        }
        expect(stream).toBeNull();
        expect(error).toBeTruthy();
    });
*/
});

