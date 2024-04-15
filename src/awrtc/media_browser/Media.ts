import { DeviceApi, MediaDevice } from "./DeviceApi";
import { VideoInput } from "./VideoInput";
import { MediaConfig } from "media/MediaConfig";

export class Media{
    //experimental. Will be used instead of the device api to create streams 
    private static sSharedInstance :Media = new Media();
    /**
     * Singleton used for now as the browser version is missing a proper factory yet. 
     * Might be removed later.
     */
    public static get SharedInstance(){
        return this.sSharedInstance;
    } 

    public static ResetSharedInstance(){
        this.sSharedInstance = new Media();
    }

    private videoInput: VideoInput = null;

    public get VideoInput() : VideoInput{
        if(this.videoInput === null)
            this.videoInput = new VideoInput();
        return this.videoInput;
    }


    private mScreenCaptureDevice = "_screen";
    private mAllowScreenCapture = false;
    private mAllowAudioCapture = false;

    public constructor(){

    }

    public EnableScreenCapture(deviceName: string, captureAudio: boolean) {
        this.mScreenCaptureDevice = deviceName;
        this.mAllowScreenCapture = true;
        this.mAllowAudioCapture = captureAudio;
    }
    public DisableScreenCapture() {
        this.mAllowScreenCapture = false;
        this.mAllowAudioCapture = false;
    }

    public GetVideoDevices(): string[] {
        let device_list = DeviceApi.GetVideoDevices();
        if (this.VideoInput != null)
        {
            const virtual_devices: string[] = this.VideoInput.GetDeviceNames();
            device_list = device_list.concat(virtual_devices);
        }


        if (this.mAllowScreenCapture) {
            device_list.push(this.mScreenCaptureDevice);
        }
        
        return device_list;
    }

    
    public GetAudioInputDevices(): MediaDevice[] {
        let device_list = DeviceApi.GetAudioInputDevices();        
        return device_list;
    }

    
    public static IsNameSet(videoDeviceName: string) : boolean{

        if(videoDeviceName !== null && videoDeviceName !== "" )
        {
            return true;
        }
        return false;
    }

    public async getUserMedia(config_in: MediaConfig): Promise<MediaStream> {


        const configNeeded = config_in.clone();
        const result = new MediaStream();
        //first we check if the video device corresponds to a non physical camera
        if (configNeeded.Video && Media.IsNameSet(configNeeded.VideoDeviceName)) {
            //a specific video device is requested.
            if (this.videoInput != null && this.videoInput.HasDevice(configNeeded.VideoDeviceName)) {
                //we found a video input device that matches. add a track to it to the results
                const videoInputStream = this.videoInput.GetStream(configNeeded.VideoDeviceName);
                result.addTrack(videoInputStream.getVideoTracks()[0]);
                configNeeded.Video = false;

            } else if (this.mAllowScreenCapture && configNeeded.VideoDeviceName === this.mScreenCaptureDevice) {
                //we found a screen capture device that matches. add a track to it to the results
                let constraints: any = {};
                if (configNeeded.IdealWidth <= 0 && configNeeded.IdealHeight <= 0 ) {
                    constraints.video = true;
                } else {
                    let vconstraints: any = {};
                    if(configNeeded.IdealWidth  > 0)
                        vconstraints.width = configNeeded.IdealWidth;
                    if(configNeeded.IdealHeight  > 0)
                        vconstraints.height = configNeeded.IdealHeight;
                    constraints.video = vconstraints;
                }
                if (this.mAllowAudioCapture && configNeeded.Audio)
                    constraints.audio = true;
                const screenStream = await (navigator.mediaDevices as any).getDisplayMedia(constraints);
                if (screenStream.getVideoTracks().length > 0)
                {
                    result.addTrack(screenStream.getVideoTracks()[0]);
                } else {
                    //TODO: improve error handling
                    console.warn("Failed to get video access via getDisplayMedia");
                }
                
                if (constraints.audio)
                {
                    if (screenStream.getAudioTracks().length > 0)
                    {
                        result.addTrack(screenStream.getAudioTracks()[0]);
                        configNeeded.Audio = false;
                    } else {
                        //TODO: The API needs to be more clear here. Unclear if we should continue here
                        //or fail.
                        console.warn("Failed to get audio access via getDisplayMedia.");
                    }
                }
                configNeeded.Video = false;
            }
        }
        
        //any devices still needed? try to get them via the physical device api
        if (configNeeded.Video || configNeeded.Audio)
        {
            const deviceStream = await DeviceApi.getAssetUserMedia(configNeeded);
            deviceStream.getTracks().forEach(x => result.addTrack(x));
        }
        return result;
    }
}