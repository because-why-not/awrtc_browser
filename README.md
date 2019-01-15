# awrtc_browser
Run the following commands in the project root directory:

* npm install
* npm run build

Now you should have the final build in the ./build/bundle directory. You can test it using the test applications:
* ./build/callapp.html for the typescrypt example using ./build/bundle/apps.js (contains the merged source code from ./src/apps and ./src/awrtc )
* ./build/callapp_js.html for javascript example that runs the same app but as javascript within the html file so you can easily change the code and experiment. It is using the library only bundle from ./build/bundle/awrtc.js (source code at ./src/awrtc)

