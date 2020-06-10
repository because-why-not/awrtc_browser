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

    public static IsNameSet(videoDeviceName: string) : boolean{

        if(videoDeviceName !== null && videoDeviceName !== "" )
        {
            return true;
        }
        return false;
    }
    
    public getUserMedia(config: MediaConfig): Promise<MediaStream>{
        
        if(config.Video && Media.IsNameSet(config.VideoDeviceName) 
            && this.videoInput != null 
            && this.videoInput.HasDevice(config.VideoDeviceName))
        {

            let res = Promise.resolve().then(async ()=>{
                let stream = this.videoInput.GetStream(config.VideoDeviceName);
                if(config.Audio)
                {
                    let constraints = {} as MediaStreamConstraints
                    constraints.audio = true;
                    let audio_stream = await DeviceApi.getBrowserUserMedia(constraints);
                    stream.addTrack(audio_stream.getTracks()[0])
                }
                return stream;
            })
            
            return res;
        }

        return DeviceApi.getAssetUserMedia(config);
    }
}