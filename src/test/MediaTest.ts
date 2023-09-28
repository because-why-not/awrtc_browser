import { VideoInput, Media, DeviceApi, MediaConfig, CAPI_Media_GetVideoDevices_Length, CAPI_Media_GetVideoDevices, BrowserMediaStream, WaitForIncomingCallEventArgs } from "../awrtc/index";
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
        config.Video = true;
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

    it("GetUserMedia_videoinput", async () => {

        
        const name = "test_canvas";
        const media = new Media();
        const config = new MediaConfig();
        config.Audio = false;
        config.Video = true;
        const canvas = MakeTestCanvas();

        media.VideoInput.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);

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
    });

    

    it("GetUserMedia_videoinput_and_audio", async () => {

        
        const name = "test_canvas";
        const media = new Media();
        const config = new MediaConfig();
        config.Audio = true;
        config.Video = true;
        const canvas = MakeTestCanvas();

        media.VideoInput.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);


        config.VideoDeviceName = name;
        let stream : MediaStream = null;
        try{
            stream = await media.getUserMedia(config);
        }catch(err){
            console.error(err);
            fail(err);
        }
        expect(stream).not.toBeNull();
        expect(stream.getAudioTracks().length).toBe(1);
        expect(stream.getVideoTracks().length).toBe(1);

        
        config.VideoDeviceName = "invalid name";
        stream  = null;
        let error_result : string = null
        try{
            stream = await media.getUserMedia(config);
        }catch(err){
            error_result = err;
        }
        expect(error_result).not.toBeNull();
        expect(stream).toBeNull();
        
    }, 15000);
    
    //CAPI needs to be changed to use Media only instead the device API
    it("MediaCapiVideoInput", async () => {
        //empty normal device api
        DeviceApi.Reset();
        expect(CAPI_Media_GetVideoDevices_Length()).toBe(0);

        const name = "test_canvas";
        const canvas = MakeTestCanvas();

        Media.SharedInstance.VideoInput.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);
        expect(CAPI_Media_GetVideoDevices_Length()).toBe(1);
        expect(CAPI_Media_GetVideoDevices(0)).toBe(name);
    });
});


describe("MediaStreamTest", () => {

    beforeEach((done)=>{
        let handler = ()=>{
            DeviceApi.RemOnChangedHandler(handler);
            done();
        };
        DeviceApi.AddOnChangedHandler(handler);
        DeviceApi.Update();

        Media.ResetSharedInstance();

    });

    
    
    class TestStreamContainer
    {
        public canvas: HTMLCanvasElement;
        public stream : MediaStream;

        public constructor()
        {
            let canvas = document.createElement("canvas");
            document.body.appendChild(canvas);  
            canvas.width = 64;
            canvas.height = 64;
            let ctx = canvas.getContext("2d");
            //make blue for debugging purposes
            ctx.fillStyle = "blue";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            this.canvas = canvas;
            this.stream =  (canvas as any).captureStream() as MediaStream; 
        }

        public MakeFrame(color : string){
            let ctx = this.canvas.getContext("2d");
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
            //make blue for debugging purposes
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        }
    }


    function MakeTestStreamContainer()
    {
        return new TestStreamContainer();
    }
    //TODO: need proper way to wait and check with async/ await
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    async function WaitFor(){

    }
    

    it("buffer_and_trygetframe", async() => {
        BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;
        const testcontainer = MakeTestStreamContainer();
        const stream = new BrowserMediaStream(true);
        stream.UpdateTrack(testcontainer.stream.getTracks()[0]);

        //frames are not available at the start until fully loaded
        let frame = stream.TryGetFrame();
        expect(frame).toBeNull();
        await sleep(100);
        stream.Update();
        //waited for the internals to get initialized. We should have a frame now
        frame = stream.TryGetFrame();
        expect(frame).not.toBeNull();;

        //and a buffer
        let buffer = frame.Buffer;
        console.log(buffer);
        expect(buffer).not.toBeNull();;
        
        //expected to be blue
        let r = buffer[0];
        let g = buffer[1];
        let b = buffer[2];
        let a = buffer[3];
        //browser might change the color slightly so use less / Greater instead of exact numbers
        expect(r).toBeLessThan(5);
        expect(g).toBeLessThan(5);
        expect(b).toBeGreaterThan(250);
        expect(a).toBeGreaterThan(250);

        //we removed the frame now. this should be null
        
        frame = stream.TryGetFrame();
        
        expect(frame).toBeNull();
        
        //make a new frame with different color
        testcontainer.MakeFrame("#FFFF00");
        
        await sleep(100);
        stream.Update();
        //get new frame
        frame = stream.TryGetFrame();
        expect(frame).not.toBeNull();;
        buffer = frame.Buffer;
        expect(buffer).not.toBeNull();;
        
        //should be different color now
        r = buffer[0];
        g = buffer[1];
        b = buffer[2];
        a = buffer[3];
        expect(r).toBeGreaterThan(250);
        expect(g).toBeGreaterThan(250);
        expect(b).toBeLessThan(5);
        expect(a).toBeGreaterThan(250);
        
    });

    function createTexture(gl: WebGL2RenderingContext) : WebGLTexture
    {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Because images have to be download over the internet
        // they might take a moment until they are ready.
        // Until then put a single pixel in the texture so we can
        // use it immediately. When the image has finished downloading
        // we'll update the texture with the contents of the image.
        const level = 0;
        const internalFormat = gl.RGBA;
        const width = 1;
        const height = 1;
        const border = 0;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                        width, height, border, srcFormat, srcType,
                        pixel);
        return texture;
    }
    it("texture", async() => {
        
        //blue test container to stream from
        const testcontainer = MakeTestStreamContainer();

        const stream = new BrowserMediaStream(true);
        stream.UpdateTrack(testcontainer.stream.getTracks()[0]);
        //document.body.appendChild(testcontainer.canvas);

        //waited for the internals to get initialized. We should have a frame now
        await sleep(100);
        stream.Update();
        let frame = stream.PeekFrame()
        expect(frame).not.toBeNull();

        //create another canvas but with WebGL context
        //this is where we copy the texture to
        let canvas = document.createElement("canvas");
        canvas.width = testcontainer.canvas.width;
        canvas.height = testcontainer.canvas.height;
        //document.body.appendChild(canvas);
        let gl = canvas.getContext("webgl2");
        //testing only. draw this one red
        gl.clearColor(1,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        

        //create new texture and copy the image into it
        let texture = createTexture(gl);
        let res = frame.ToTexture(gl, texture);
        expect(res).toBe(true);
        
        //we attach our test texture to a frame buffer, then read from it to copy the data back from the GPU
        //into an array dst_buffer
        const dst_buffer = new Uint8Array(testcontainer.canvas.width *  testcontainer.canvas.height * 4);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.readPixels(0, 0, testcontainer.canvas.width, testcontainer.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, dst_buffer);
        
        

        //check if we have the expected blue color we use to setup the testcontainer canvas
        let r = dst_buffer[0];
        let g = dst_buffer[1];
        let b = dst_buffer[2];
        let a = dst_buffer[3];
        expect(r).toBe(0);
        expect(g).toBe(0);
        expect(b).toBe(255);
        expect(a).toBe(255);

        //TODO: could compare whole src / dst buffer to check if something is cut off
        //const compare_buffer = frame.Buffer;
    });

});