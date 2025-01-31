import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  createXRStore,
  IfInSessionMode,
  noEvents,
  PointerEvents,
  useXRMeshes,
  XR,
  XRMeshModel,
  XRSpace,
} from "@react-three/xr";
import { Fullscreen } from "@react-three/uikit";
import { EnterXRButton } from "./EnterXRButton";

const store = createXRStore({
  offerSession: "immersive-ar",
});

export default function App() {
  return (
    <Canvas events={noEvents}>
      <XR store={store}>
        <PointerEvents />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} />
        <Navigation />
        <OrbitControls />
        <IfInSessionMode deny={["immersive-ar", "immersive-vr"]}>
          <Fullscreen
            flexDirection="row"
            padding={20}
            paddingRight={50}
            alignItems="flex-start"
            justifyContent="flex-end"
            pointerEvents="listener"
            pointerEventsOrder={3}
          >
            <EnterXRButton />
          </Fullscreen>
        </IfInSessionMode>
      </XR>
    </Canvas>
  );
}

function Navigation() {
  const meshes = useXRMeshes();
  return (
    <>
      {meshes.map((mesh, index) => (
        <XRSpace key={index} space={mesh.meshSpace}>
          <XRMeshModel mesh={mesh}>
            <meshBasicMaterial wireframe />
          </XRMeshModel>
        </XRSpace>
      ))}
    </>
  );
}
