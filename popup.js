const video = document.getElementById("video");
const emotion = document.getElementById("emotion");

document.getElementById("start").onclick = async () => {
try {

const stream = await navigator.mediaDevices.getUserMedia({
video: true,
audio: false
});

video.srcObject = stream;

emotion.innerText = "Emotion: Detecting...";

setTimeout(()=>{
emotion.innerText = "Emotion: Happy";
},2000);

} catch (err) {
console.error(err);
emotion.innerText = "Camera access denied";
}
};