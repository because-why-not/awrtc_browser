import { VideoInput, Media, DeviceApi, MediaConfig, CAPI_DeviceApi_Devices_Length, CAPI_DeviceApi_Devices_Get } from "../awrtc/index";
import { MakeTestCanvas } from "VideoInputTest";

export function MediaTest_export()
{


}

describe("MediaTest", () => {

    beforeEach((done)=>{
        let handler = ()=>{
            DeviceApi.RemOnChangedHandler(handler);
            done();
        };
        DeviceApi.AddOnChangedHandler(handler);
        DeviceApi.Update();

        Media.ResetSharedInstance();

    });

    it("SharedInstance", () => {
        
        expect(Media.SharedInstance).toBeTruthy();
        let instance1 = Media.SharedInstance;
        Media.ResetSharedInstance();
        expect(Media.SharedInstance).not.toBe(instance1);
    });

    it("GetVideoDevices", () => {
        const media = new Media();
        let devs = media.GetVideoDevices();
        expect(devs).toBeTruthy();
        expect(devs.length).toBeGreaterThan(0);
    });
    
    it("GetUserMedia", async () => {

        const media = new Media();
        let config = new MediaConfig();
        config.Audio = false;
        let stream = await media.getUserMedia(config);
        expect(stream).not.toBeNull();
        expect(stream.getAudioTracks().length).toBe(0);
        expect(stream.getVideoTracks().length).toBe(1);

        stream = null;
        let err = null;
        config.VideoDeviceName = "invalid name"
        console.log("Expecting error message: Failed to find deviceId for label invalid name");
        try{
            stream = await media.getUserMedia(config);
        }catch(error){
            err = error;
        }
        expect(err).not.toBeNull();
        expect(stream).toBeNull();
    });

    it("GetUserMedia_videoinput", async (done) => {

        
        const name = "test_canvas";
        const media = new Media();
        const config = new MediaConfig();
        config.Audio = false;
        config.Video = true;
        const canvas = MakeTestCanvas();

        media.VideoInput.AddCanvasDevice(name, canvas);

        const streamCamera = await media.getUserMedia(config);
        expect(streamCamera).not.toBeNull();
        expect(streamCamera.getAudioTracks().length).toBe(0);
        expect(streamCamera.getVideoTracks().length).toBe(1);

        config.VideoDeviceName = name;
        const streamCanvas = await media.getUserMedia(config);
        expect(streamCanvas).not.toBeNull();
        expect(streamCanvas.getAudioTracks().length).toBe(0);
        expect(streamCanvas.getVideoTracks().length).toBe(1);

        const streamCanvas2 = await media.getUserMedia(config);
        expect(streamCanvas2).not.toBeNull();
        expect(streamCanvas2.getAudioTracks().length).toBe(0);
        expect(streamCanvas2.getVideoTracks().length).toBe(1);
        done();
    });
    

    
    //CAPI needs to be changed to use Media only instead the device API
    it("MediaCapiVideoInput", async (done) => {
        //empty normal device api
        DeviceApi.Reset();
        expect(CAPI_DeviceApi_Devices_Length()).toBe(0);

        const name = "test_canvas";
        const canvas = MakeTestCanvas();

        Media.SharedInstance.VideoInput.AddCanvasDevice(name, canvas);
        expect(CAPI_DeviceApi_Devices_Length()).toBe(1);
        expect(CAPI_DeviceApi_Devices_Get(0)).toBe(name);
        
        done();
    });
});