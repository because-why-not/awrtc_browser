import { VideoInput, VideoInputType } from "../awrtc/index";

export function VideoInputTest_export() {

}

export function MakeTestCanvas(w?: number, h?: number): HTMLCanvasElement {
    if (w == null)
        w = 4;
    if (h == null)
        h = 4;
    let canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    let ctx = canvas.getContext("2d");
    //make blue for debugging purposes
    ctx.fillStyle = "blue";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
}

export function MakeBrokenTestCanvas(): HTMLCanvasElement {

    let canvas = document.createElement("canvas");
    return canvas;
}


/**Create test image with pattern
 * Black White
 * White Black
 * 
 * So each corner can be tested for correct results.
 * 
 * @param src_width 
 * @param src_height 
 */
export function MakeTestImage(src_width: number, src_height: number): ImageData {

    let src_size = src_width * src_height * 4;
    let src_data = new Uint8ClampedArray(src_size);
    for (let y = 0; y < src_height; y++) {
        for (let x = 0; x < src_width; x++) {
            let pos = y * src_width + x;
            let xp = x >= src_width / 2;
            let yp = y >= src_height / 2;

            let val = 0;
            if (xp || yp)
                val = 255;
            if (xp && yp)
                val = 0;

            src_data[pos * 4 + 0] = val;
            src_data[pos * 4 + 1] = val;
            src_data[pos * 4 + 2] = val;
            src_data[pos * 4 + 3] = 255;
        }
    }
    var src_img = new ImageData(src_data, src_width, src_height);
    return src_img;
}


export function ExtractData(video: HTMLVideoElement): ImageData {

    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    let dst_context = canvas.getContext('2d')
    dst_context.drawImage(video, 0, 0, canvas.width, canvas.height);
    let dst_img = dst_context.getImageData(0, 0, canvas.width, canvas.height);
    return dst_img
}

describe("VideoInputTest", () => {

    beforeEach(() => {

    });
    it("AddRem", () => {
        let name = "test_canvas";
        let vi = new VideoInput();
        let canvas = document.createElement("canvas")

        expect(vi.HasDevice(name)).toBe(false);
        vi.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);
        expect(vi.HasDevice(name)).toBe(true);

        vi.RemoveDevice(name);
        expect(vi.HasDevice(name)).toBe(false);
    });
    it("GetDeviceNames", () => {
        let name = "test_canvas";
        let name2 = "test_canvas2";
        let vi = new VideoInput();
        let canvas = document.createElement("canvas")
        let names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(0);


        vi.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);
        names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(1);
        expect(names[0]).toBe(name);


        vi.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);
        names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(1);
        expect(names[0]).toBe(name);

        vi.AddCanvasDevice(canvas, name2, canvas.width, canvas.height, 30);
        names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(2);
        expect(names.sort()).toEqual([name, name2].sort());

    });

    it("GetStream", () => {
        let name = "test_canvas";
        let vi = new VideoInput();
        let canvas = MakeTestCanvas();

        let stream = vi.GetStream(name);
        expect(stream).toBeNull();


        vi.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);
        stream = vi.GetStream(name);
        expect(stream).toBeTruthy();

    });


    it("AddCanvasDevice_no_scaling", (done) => {
        let name = "test_canvas";
        let vi = new VideoInput();
        const src_width = 40;
        const src_height = 30;
        let canvas = MakeTestCanvas(src_width, src_height);


        vi.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);
        let stream = vi.GetStream(name);
        expect(stream).toBeTruthy();

        let videoOutput = document.createElement("video")

        videoOutput.onloadedmetadata = () => {
            expect(videoOutput.videoWidth).toBe(src_width)
            expect(videoOutput.videoHeight).toBe(src_height)
            done()
        }
        videoOutput.srcObject = stream;

    }, 1000);


    it("AddCanvasDevice_scaling", (done) => {

        let debug = false;
        let name = "test_canvas";
        let vi = new VideoInput();
        const src_width = 64;
        const src_height = 64;
        const dst_width = 32;
        const dst_height = 32;
        let canvas = MakeTestCanvas(src_width, src_height);
        let srcContext = canvas.getContext("2d");

        var src_img = MakeTestImage(src_width, src_height);
        srcContext.putImageData(src_img, 0, 0)

        if (debug)
            document.body.appendChild(canvas);

        vi.AddCanvasDevice(canvas, name, dst_width, dst_height, 30);
        let stream = vi.GetStream(name);
        expect(stream).toBeTruthy();

        let videoOutput = document.createElement("video")

        if (debug)
            document.body.appendChild(videoOutput);
        videoOutput.onloadedmetadata = () => {
            expect(videoOutput.videoWidth).toBe(dst_width)
            expect(videoOutput.videoHeight).toBe(dst_height)

            let dst_img_data = ExtractData(videoOutput)
            //upper left
            expect(dst_img_data.data[0]).toBe(0);

            //upper right
            expect(dst_img_data.data[((dst_width - 1) * 4)]).toBe(255);

            //lower left
            expect(dst_img_data.data[((dst_height - 1) * dst_width) * 4]).toBe(255);

            //lower right
            expect(dst_img_data.data[(dst_height * dst_width - 1) * 4]).toBe(0);

            vi.RemoveDevice(name);
            done()
        }
        videoOutput.srcObject = stream;

    }, 1000);

    //not yet clear how this can be handled
    //this test will trigger an error in firefox
    xit("GetStream_no_context", () => {
        let name = "test_canvas";
        let vi = new VideoInput();
        let canvas = MakeBrokenTestCanvas();

        //if we try to record from a canvas before
        //a context was accessed it will fail. 

        //uncommenting this line fixes the bug
        //but this is out of our control / within user code
        //let ctx = canvas.getContext("2d");



        let stream = vi.GetStream(name);
        expect(stream).toBeNull();


        vi.AddCanvasDevice(canvas, name, canvas.width, canvas.height, 30);
        stream = vi.GetStream(name);
        expect(stream).toBeTruthy();
    });


    //not yet clear how this can be handled
    //this test will trigger an error in firefox
    it("AddRemDevice", () => {
        let name = "test_canvas";
        const w = 640;
        const h = 480;
        const fps = 30;
        let vi = new VideoInput();



        let stream = vi.GetStream(name);
        expect(stream).toBeNull();


        vi.AddDevice(name, w, h, fps);

        let res = vi.GetDeviceNames().indexOf(name);
        expect(res).toBe(0);

        vi.RemoveDevice(name);
        let res2 = vi.GetDeviceNames().indexOf(name);
        expect(res2).toBe(-1);
    });

    it("Device_int_array", () => {
        let name = "test_canvas";
        const w = 2;
        const h = 2;
        const fps = 30;
        let arr = new Uint8ClampedArray([
            1, 2, 3, 255,
            4, 5, 6, 255,
            7, 8, 9, 255,
            10, 11, 12, 255,
            13, 14, 15, 255
        ]);




        let vi = new VideoInput();

        vi.AddDevice(name, w, h, fps);

        let stream = vi.GetStream(name);
        expect(stream).toBeTruthy();
        const clamped = new Uint8ClampedArray(arr.buffer, 4, 4 * 4);
        const res = vi.UpdateFrame(name, clamped, w, h, VideoInputType.ARGB, 0, false);
        expect(res).toBe(true);

        let result_canvas = (vi as any).canvasDevices[name].canvas as HTMLCanvasElement;
        expect(result_canvas.width).toBe(w);
        expect(result_canvas.height).toBe(h);
        let result_img = result_canvas.getContext("2d").getImageData(0, 0, result_canvas.width, result_canvas.height);
        const result_arr = new Uint8Array(result_img.data.buffer);
        const base_arr = new Uint8Array(arr.buffer, 4, 4 * 4);
        expect(base_arr).toEqual(result_arr);
    });

    it("Device_full", () => {
        let src_canvas = MakeTestCanvas();
        let src_ctx = src_canvas.getContext("2d");
        src_ctx.fillStyle = "yellow";
        src_ctx.fillRect(0, 0, src_canvas.width, src_canvas.height);
        let name = "test_canvas";
        const w = 2;
        const h = 2;
        const fps = 30;
        src_canvas.width = w;
        src_canvas.height = h;




        let vi = new VideoInput();

        let src_img = src_ctx.getImageData(0, 0, src_canvas.width, src_canvas.height);
        vi.AddDevice(name, w, h, fps);

        let stream = vi.GetStream(name);
        expect(stream).toBeTruthy();
        const res = vi.UpdateFrame(name, src_img.data, src_img.width, src_img.height, VideoInputType.ARGB, 0, false);
        expect(res).toBe(true);

        //test if the internal array was set correctly
        let result_canvas = (vi as any).canvasDevices[name].canvas as HTMLCanvasElement;
        expect(result_canvas.width).toBe(src_canvas.width);
        expect(result_canvas.height).toBe(src_canvas.height);

        let result_img = result_canvas.getContext("2d").getImageData(0, 0, result_canvas.width, result_canvas.height);
        expect(result_img.width).toBe(src_img.width);
        expect(result_img.height).toBe(src_img.height);
        expect(result_img.data).toEqual(src_img.data);
    });
});