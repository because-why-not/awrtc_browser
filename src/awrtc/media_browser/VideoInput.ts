interface CanvasMap{
    [key:string] : HTMLCanvasElement;
}

export class VideoInput{
    private canvasDevices : CanvasMap = {};

    constructor(){

    }
    
    public AddCanvasDevice(deviceName: string, canvas : HTMLCanvasElement){
        this.canvasDevices[deviceName] = canvas;
    }

    public RemCanvasDevice(deviceName: string){
        delete this.canvasDevices[deviceName];
    }

    public HasDevice(dev: string): boolean{
        return dev in this.canvasDevices;
    }

    public GetStream(dev: string) : MediaStream | null
    {
        if(this.HasDevice(dev)){
            let canvas = this.canvasDevices[dev];
            
            //watch out: This can trigger an exception if getContext has never been called before.
            //There doesn't seem to way to detect this beforehand though
            let stream = (canvas as any).captureStream();

            return stream;
        }
        return null;
    }

    public GetDeviceNames() : Array<string>{
        return Object.keys(this.canvasDevices);
    }

    

}