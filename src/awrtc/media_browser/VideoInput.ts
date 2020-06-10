/**TS version of the C++ / C# side Native VideoInput API
 * 
 * 
 * In addition it also supports adding a HTMLCanvasElement as a video device. This can be
 * a lot faster in the browser than the C / C++ style UpdateFrame methods that use raw byte arrays
 * or pointers to deliver an image.
 * 
 * Note there are currently three distinct ways how this is used:
 * 1.   Using AddCanvasDevice without scaling (wdith = 0, height =0 or the same as the canvas)
 *      In this mode the MediaStream will be returned from the canvas. Drawing calls from the canvas
 *      turn into video frames of the video without any manual UpdateFrame calls
 * 
 * 2.   Using AddCanvasDevice with scaling by setting a width / height different from the canvas.
 *      In this mode the user draws to the canvas and every time UpdateFrame is called a scaled frame
 *      is created that will turn into video frames. Lower UpdateFrame calls will reduce the framerate
 *      even if the original canvas us used a higher framerate. 
 *      This mode should result in lower data usage.
 * 
 * 3.   Using AddDevice and UpdateFrame to deliver raw byte array frames. This is a compatibility mode
 *      that works similar to the C / C++ and C# API. An internal canvas is created and updated based on
 *      the data the user delivers. This mode makes sense if you generate custom data that doesn't have
 *      a canvas as its source.
 *      This mode can be quite slow and inefficient. 
 * 
 * TODO: 
 *  -   Using AddDevice with one resolution & UpdateFrame with another might not support scaling yet but 
 *      activating the 2nd canvas for scaling might
 *      reduce the performance even more. Check if there is a better solution and if scaling is even needed.
 *      It could easily be added by calling initScaling but it must be known if scaling is required before
 *      the device is selected by the user. Given that scaling can reduce the performance doing so by default
 *      might cause problems for some users.
 * 
 *  -   UpdateFrame rotation and firstRowIsBottom aren't supported yet. Looks like they aren't needed for
 *      WebGL anyway. Looks like frames here always start with the top line and rotation is automatically
 *      handled by the browser.
 * 
 */
export class VideoInput {
    private canvasDevices: CanvasMap = {};

    constructor() {

    }
    /**Adds a canvas to use as video source for streaming. 
     * 
     * Make sure canvas.getContext is at least called once before calling this method.
     * 
     * @param canvas 
     * @param deviceName 
     * @param width 
     * @param height 
     * @param fps 
     */
    public AddCanvasDevice(canvas: HTMLCanvasElement, deviceName: string, width: number, height: number, fps: number) {


        let cdev = CanvasDevice.CreateExternal(canvas, fps);

        if (width != canvas.width || height != canvas.height) {
            //console.warn("testing scaling");
            cdev.initScaling(width, height);
        }
        this.canvasDevices[deviceName] = cdev;
    }
    /**For internal use.
     * Allows to check if the device already exists.
     * 
     * @param dev 
     */
    public HasDevice(dev: string): boolean {
        return dev in this.canvasDevices;
    }

    /**For internal use.
     * Lists all registered devices. 
     * 
     */
    public GetDeviceNames(): Array<string> {
        return Object.keys(this.canvasDevices);
    }

    /**For internal use.
     * Returns a MediaStream for the given device.
     * 
     * @param dev 
     */
    public GetStream(dev: string): MediaStream | null {
        if (this.HasDevice(dev)) {
            let device = this.canvasDevices[dev];

            //watch out: This can trigger an exception if getContext has never been called before.
            //There doesn't seem to way to detect this beforehand though
            let stream = device.captureStream();

            return stream;
        }
        return null;
    }


    /**C# API: public void AddDevice(string name, int width, int height, int fps);
     * 
     * Adds a device that will be accessible via the given name. Width / Height determines
     * the size of the canvas that is used to stream the video.
     * 
     * 
     * @param name unique name for the canvas
     * @param width width of the canvase used for the stream
     * @param height height of the canvase used for the stream
     * @param fps Expected FPS used by the stream. 0 or undefined to let the browser decide (likely based on actual draw calls)
     */
    public AddDevice(name: string, width: number, height: number, fps?: number): void {
        let cdev = CanvasDevice.CreateInternal(width, height, fps);
        this.canvasDevices[name] = cdev;
    }


    private RemCanvasDevice(deviceName: string) {

        let cdev = this.canvasDevices[deviceName];
        if (cdev) {
            delete this.canvasDevices[deviceName];
        }
    }
    //C# API: public void RemoveDevice(string name);
    public RemoveDevice(name: string): void {
        this.RemCanvasDevice(name);
    }
    public UpdateFrame(name: string): boolean;
    public UpdateFrame(name: string, dataPtr: Uint8ClampedArray, width: number, height: number, type: VideoInputType): boolean
    public UpdateFrame(name: string, dataPtr: Uint8ClampedArray, width: number, height: number, type: VideoInputType, rotation: number, firstRowIsBottom: boolean): boolean
    /**
     * Use UpdateFrame with name only to trigger a new frame without changing the content (e.g. if AddCanvasDevice was used to add the device and it needs scaling)
     * Use UpdateFrame with image data if you added the device via AddDevice and want to updat its content
     * 
     * 
     * 
     * @param name name of the device
     * @param dataPtr array to the image data 
     * @param width must be the exact width of the image in dataPtr
     * @param height must be the exact height of the image in dataPtr
     * @param type must be ARGB at the moment
     * @param rotation not yet supported
     * @param firstRowIsBottom not yet supported
     */
    public UpdateFrame(name: string, dataPtr?: Uint8ClampedArray, width?: number, height?: number, type: VideoInputType = VideoInputType.ARGB, rotation: number = 0, firstRowIsBottom: boolean = true): boolean {

        if (this.HasDevice(name)) {
            let device = this.canvasDevices[name];
            if (device.IsExternal() || dataPtr == null) {
                //can't change external images / no data available. just generate a new frame without new data 
                device.UpdateFrame();
            } else {
                var data = new ImageData(dataPtr, width, height);
                device.UpdateFrame(data);
            }

            return true;
        }

        return false;
    }
}

interface FancyHTMLCanvasElement extends HTMLCanvasElement {
    captureStream(fps?: number): MediaStream;
}

/**Wraps around a canvas object to use as a source for MediaStream.
 * It supports streaming via a second canvas that is used to scale the image 
 * before streaming. For scaling UpdateFrame needs to be called one a frame. 
 * Without scaling the browser will detect changes in the original canvas
 * and automatically update the stream
 * 
 */
class CanvasDevice {
    /**Main canvas. This is actively drawn onto by the user (external) 
     * or by this class.
     * 
     */
    private canvas: FancyHTMLCanvasElement;

    /**false = we own the canvas and can change its settings e.g. via VideoInput
     * true = externally used canvas. Can't change width / height or any other settings
     */
    private external_canvas = false;

    /** FPS used for the canvas captureStream.
     * 0 or undefined to let the browser handle it automatically via captureStream()
     */
    private fps?: number;

    /**Canvas element to handle scaling.
     * Remains null if initScaling is never called and width / height is expected to
     * fit the canvas.
     * 
     */
    private scaling_canvas: FancyHTMLCanvasElement = null;

    //private scaling_interval = -1;

    private is_capturing = false;

    public getStreamingCanvas() {
        if (this.scaling_canvas == null)
            return this.canvas;
        return this.scaling_canvas;
    }

    public captureStream() {
        if (this.is_capturing == false && this.scaling_canvas) {
            //scaling is active. 
            this.startScaling();
        }
        this.is_capturing = true;
        if (this.fps && this.fps > 0) {
            return this.getStreamingCanvas().captureStream(this.fps);
        }
        return this.getStreamingCanvas().captureStream();
    }


    private constructor(c: HTMLCanvasElement, external_canvas: boolean, fps?: number) {
        this.canvas = c as FancyHTMLCanvasElement;
        this.external_canvas = external_canvas;
        this.fps = fps;
    }

    public static CreateInternal(width: number, height: number, fps?: number) {
        const c = CanvasDevice.MakeCanvas(width, height);
        return new CanvasDevice(c, false, fps);
    }
    public static CreateExternal(c: HTMLCanvasElement, fps?: number) {
        return new CanvasDevice(c, true, fps);
    }

    /**Adds scaling support to this canvas device.
     * 
     * @param width 
     * @param height 
     */
    public initScaling(width: number, height: number) {

        this.scaling_canvas = document.createElement("canvas") as FancyHTMLCanvasElement;
        this.scaling_canvas.width = width;
        this.scaling_canvas.height = height;
        this.scaling_canvas.getContext("2d");

    }

    /**Used to update the frame data if the canvas is managed internally.
     * Use without image data to just trigger the scaling / generation of a new frame if the canvas is drawn to externally.
     * 
     * If the canvas is managed externally and scaling is not required this method won't do anything. A new frame is instead
     * generated automatically based on the browser & canvas drawing operations.
     */
    public UpdateFrame(data?: ImageData): void {
        if (data) {
            let ctx = this.canvas.getContext("2d");
            //TODO: This doesn't seem to support scaling out of the box
            //we might need to combien this with the scaling system as well
            //in case users deliver different resolutions than the device is setup for
            ctx.putImageData(data, 0, 0);
        }
        this.scaleNow();
    }
    /**Called the first time we need the scaled image to ensure
     * the buffers are all filled.
     */
    private startScaling() {

        this.scaleNow();
    }

    private scaleNow() {
        if (this.scaling_canvas != null) {

            let ctx = this.scaling_canvas.getContext("2d");
            //ctx.fillStyle = "#FF0000";
            //ctx.fillRect(0, 0, this.scaling_canvas.width, this.scaling_canvas.height);
            //ctx.clearRect(0, 0, this.scaling_canvas.width, this.scaling_canvas.height)
            ctx.drawImage(this.canvas, 0, 0, this.scaling_canvas.width, this.scaling_canvas.height);
        }
    }
    public IsExternal(): boolean {
        return this.external_canvas;
    }


    private static MakeCanvas(width: number, height: number): FancyHTMLCanvasElement {

        let canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        let ctx = canvas.getContext("2d");
        //make red for debugging purposes
        ctx.fillStyle = "red";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvas as FancyHTMLCanvasElement;
    }
}

interface CanvasMap {
    [key: string]: CanvasDevice;
}

/** Only one format supported by browsers so far.
 *  Maybe more can be added in the future. 
 */
export enum VideoInputType {
    ARGB
}
