import { useEffect, useRef, useState } from "react";
import { Chat } from "../components/Chat";
import { Avatar, Button } from "@nextui-org/react";
import { CameraIcon } from "../components/CameraIcon";
import { MicrophoneIcon } from "../components/MicrophoneIcon";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { Snippet } from "@nextui-org/snippet";

export const MeetingRoom = ({ username }) => {
    const userVideoRef = useRef();
    const remoteVideoRef = useRef();
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(false);
    const [socket, setSocket] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const { roomId } = useParams();
    const [sendingPc, setSendingPc] = useState(null);
    const [receivingPc, setReceivingPc] = useState(null);

    const configuration = {
        iceServers: [
            {
                urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
            },
        ],
        iceCandidatePoolSize: 10,
    };

    useEffect(() => {
        const initializeMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: isVideoOn,
                    audio: isAudioOn,
                });
                if (userVideoRef.current) {
                    userVideoRef.current.srcObject = stream;
                }
                setLocalStream(stream);
            } catch (error) {
                console.error("Error accessing media devices.", error);
            }
        };

        initializeMedia();

        return () => {
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop());
            }
            setLocalStream(null);
        };
    }, [isVideoOn, isAudioOn]);


    useEffect(() => {
        const socket = io("http://localhost:3000", { transports: ["websocket"] });

        socket.on('send-offer', async ({ meetingCode, roomId }) => {
            console.log("Sending offer to join the call");
            const pc = new RTCPeerConnection(configuration);

            setSendingPc(pc);

            localStream?.getTracks().forEach(track => {
                if (track.kind === "video" && isVideoOn) {
                    pc.addTrack(track);
                }
                else if (track.kind === "audio" && isAudioOn) {
                    pc.addTrack(track);
                }
            })

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit("add-ice-candidate", {
                        candidate: e.candidate,
                        type: "sender",
                        meetingCode
                    });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer", {
                sdp: offer,
                roomId
            });
        });

        socket.on("offer", async ({ roomId, sdp: remoteSdp }) => {
            console.log("Received an offer from another user");
            const pc = new RTCPeerConnection(configuration);

            await pc.setRemoteDescription(remoteSdp);
            const sdp = await pc.createAnswer();
            await pc.setLocalDescription(sdp);

            const remoteStream = new MediaStream();
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
            }

            setRemoteMediaStream(remoteStream);
            setReceivingPc(pc);
            window.pcr = pc;

            pc.ontrack = (e) => {
                remoteStream.addTrack(e.track);
            };

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit("add-ice-candidate", {
                        candidate: e.candidate,
                        type: "receiver",
                        meetingCode
                    });
                }
            };

            socket.emit("answer", {
                roomId,
                sdp: sdp
            });
        });


        socket.on("answer", ({ roomId, sdp: remoteSdp }) => {
            setSendingPc((pc) => {
                pc?.setRemoteDescription(new RTCSessionDescription(remoteSdp));
                return pc;
            });
        });

        socket.on("add-ice-candidate", ({ candidate, type }) => {
            if (type === "sender") {
                setReceivingPc((pc) => {
                    pc?.addIceCandidate(new RTCIceCandidate(candidate));
                    return pc;
                });
            } else {
                setSendingPc((pc) => {
                    pc?.addIceCandidate(new RTCIceCandidate(candidate));
                    return pc;
                });
            }
        });

        setSocket(socket);

        return () => {
            socket.disconnect();
        };
    }, [localStream, isVideoOn, isAudioOn, receivingPc, sendingPc]);




    const toggleVideo = async () => {
        setIsVideoOn((prev) => !prev);
        if (localStream) {
            localStream.getVideoTracks()[0].enabled = !isVideoOn;
        }
    };

    const toggleAudio = async () => {
        setIsAudioOn((prev) => !prev);
        if (localStream) {
            localStream.getAudioTracks()[0].enabled = !isAudioOn;
        }
    };

    const MeetingCode = window.location.pathname.replace('/meeting/', '');
    return (
        <div className="h-screen flex pt-4 pb-4">
            <div className="bg-gray-800 mr-2 rounded-md p-6 ml-4 w-[70%]">
                {remoteVideoRef? (
                    <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full rounded-lg"
                    id="remoteVideoRef"
                />): (
                    <Avatar
                        name={username[0] ? username[0] : "?"}
                        size="lg"
                        className="mr-auto ml-auto text-2xl"
                    />)
                }
            </div>
            <div className="grid grid-rows-2 gap-2 mr-2 w-[30%]">
                <div className="bg-gray-800 rounded-md justify-center flex flex-wrap items-center">
                    {isVideoOn ? (
                        <video
                            ref={userVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full rounded-lg"
                            id="userVideoRef"
                        />
                    ) : (
                        <Avatar
                            name={username[0] ? username[0] : "?"}
                            size="lg"
                            className="mr-auto ml-auto text-2xl"
                        />
                    )}
                </div>

                <Chat username={username} roomId={roomId} />
            </div>
            <div>
                <Button
                    onClick={toggleVideo}
                    color={isVideoOn ? "secondary" : "warning"}
                    size="sm"
                    className="mr-2"
                >
                    <CameraIcon />
                </Button>
                <Button
                    onClick={toggleAudio}
                    color={isAudioOn ? "secondary" : "warning"}
                    size="sm"

                >
                    <MicrophoneIcon />
                </Button>
                <Snippet symbol="" className="mt-2">{MeetingCode}</Snippet>
            </div>
        </div>
    );
};
