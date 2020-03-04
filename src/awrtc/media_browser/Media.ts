import { DeviceApi } from "./DeviceApi";
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
    public constructor(){

    }
    public GetVideoDevices(): string[] {
        const real_devices = DeviceApi.GetVideoDevices();
        const virtual_devices : string[] = this.VideoInput.GetDeviceNames();
        return real_devices.concat(virtual_devices);
    }

    
    
    public getUserMedia(config: MediaConfig): Promise<MediaStream>{
        
        if(config.VideoDeviceName !== null 
            && config.VideoDeviceName !== "" 
            && this.videoInput != null 
            && this.videoInput.HasDevice(config.VideoDeviceName))
        {
            return new Promise<MediaStream>((resolve, reject) => {

                try{
                    const res :MediaStream = this.videoInput.GetStream(config.VideoDeviceName);
                    resolve(res)
                }catch(err)
                {
                    reject(err);
                }                
             });
            
        }

        return DeviceApi.getAssetUserMedia(config);
    }
}