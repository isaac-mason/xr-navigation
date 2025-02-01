import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Fullscreen } from '@react-three/uikit'
import { createXRStore, IfInSessionMode, noEvents, PointerEvents, useXR, useXRMeshes, XR } from '@react-three/xr'
import { CrowdHelper, DebugDrawer, getPositionsAndIndices } from '@recast-navigation/three'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Crowd, getNavMeshPositionsAndIndices, init as initRecast, NavMesh } from 'recast-navigation'
import { generateTiledNavMesh, TiledNavMeshGeneratorConfig } from 'recast-navigation/generators'
import { suspend } from 'suspend-react'
import { BufferAttribute, BufferGeometry, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { EnterXRButton } from './EnterXRButton'
import { createGetXRSpaceMatrix } from './space'

const store = createXRStore({
  offerSession: 'immersive-ar',
  emulate: {
    syntheticEnvironment: 'https://cdn.jsdelivr.net/npm/@iwer/sem/captures/living_room.json',

    // "https://cdn.jsdelivr.net/npm/@iwer/sem/captures/living_room.json"
    // "https://cdn.jsdelivr.net/npm/@iwer/sem/captures/meeting_room.json"
    // "https://cdn.jsdelivr.net/npm/@iwer/sem/captures/music_room.json"
    // "https://cdn.jsdelivr.net/npm/@iwer/sem/captures/office_large.json"
  },
})

const NAVIGATION_CONFIG = {
  cs: 0.03,
  ch: 0.03,
  tileSize: 32,
  walkableHeight: 10,
  walkableRadius: 5,
} satisfies Partial<TiledNavMeshGeneratorConfig>

export default function App() {
  return (
    <Canvas events={noEvents}>
      <XR store={store}>
        <Navigation debug config={NAVIGATION_CONFIG}>
          <PointerEvents />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} />
          <OrbitControls />
          <IfInSessionMode deny={['immersive-ar', 'immersive-vr']}>
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

          <ExampleAgents />
        </Navigation>
      </XR>
    </Canvas>
  )
}

type NavigationProps = {
  children: React.ReactNode
  config: Partial<TiledNavMeshGeneratorConfig>
  debug?: boolean
}

type NavigationContextType = {
  navMesh: NavMesh | null
  walkableMesh: Mesh | null
}

const NavigationContext = createContext<NavigationContextType>(null!)

export const useNavigation = () => {
  const context = useContext(NavigationContext)

  if (!context) {
    throw new Error('useNavigation must be used within a <Navigation /> component')
  }

  return context
}

const _position = new Vector3()

function Navigation({ children, config, debug }: NavigationProps) {
  suspend(() => initRecast(), ['_recast_navigation'])

  const scene = useThree((state) => state.scene)

  const meshes = useXRMeshes()
  const originReferenceSpace = useXR((xr) => xr.originReferenceSpace)

  const [navMesh, setNavMesh] = useState<NavMesh | null>(null)
  const [walkableMesh, setWalkableMesh] = useState<Mesh | null>(null)
  const [inputMeshGeometry, setInputMeshGeometry] = useState<BufferGeometry | null>(null)

  const lastFrame = useRef<XRFrame | null>(null)

  const [meshSpaceMatrices, setMeshSpaceMatrices] = useState(() => new Map<XRMesh, Matrix4>())
  const [meshCount, setMeshCount] = useState(0)

  // todo: clean up approach for getting xr mesh world matrices
  // matrices are only required for initial navmesh generation.
  useFrame((_, __, frame) => {
    lastFrame.current = frame

    if (meshes.length !== meshCount) {
      setMeshCount(meshes.length)
    }

    for (const mesh of meshes) {
      let matrix = meshSpaceMatrices.get(mesh)

      if (!matrix) {
        matrix = new Matrix4()
        meshSpaceMatrices.set(mesh, matrix)
      }

      const getSpaceMatrix = createGetXRSpaceMatrix(mesh.meshSpace, originReferenceSpace!)

      getSpaceMatrix(matrix, frame)
    }

    setMeshSpaceMatrices(meshSpaceMatrices)
  })

  /* navmesh generation */
  useEffect(() => {
    const combinedPositions: number[] = []
    const combinedIndices: number[] = []

    for (const mesh of meshes) {
      const meshSpaceMatrix = meshSpaceMatrices.get(mesh)

      if (!meshSpaceMatrix) {
        continue
      }

      let indexOffset = combinedPositions.length / 3

      // transform positions
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        _position.set(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2])
        _position.applyMatrix4(meshSpaceMatrix)

        combinedPositions.push(_position.x, _position.y, _position.z)
      }

      // offset indices
      for (let i = 0; i < mesh.indices.length; i++) {
        combinedIndices.push(mesh.indices[i] + indexOffset)
      }
    }

    if (debug) {
      const inputMeshGeometry = new BufferGeometry()
      inputMeshGeometry.setAttribute('position', new BufferAttribute(new Float32Array(combinedPositions), 3))
      inputMeshGeometry.setIndex(combinedIndices)

      setInputMeshGeometry(inputMeshGeometry)
    }

    const { success, navMesh } = generateTiledNavMesh(combinedPositions, combinedIndices, config, debug)

    if (success) {
      const [navMeshPositions, navMeshIndices] = getNavMeshPositionsAndIndices(navMesh)

      const navMeshGeometry = new BufferGeometry()
      navMeshGeometry.setAttribute('position', new BufferAttribute(new Float32Array(navMeshPositions), 3))
      navMeshGeometry.setIndex(navMeshIndices)

      const walkableMesh = new Mesh(navMeshGeometry)
      walkableMesh.visible = false

      setNavMesh(navMesh)
      setWalkableMesh(walkableMesh)
    }

    return () => {
      setNavMesh(null)
      setWalkableMesh(null)
    }
  }, [meshes, meshCount, config, debug])

  /* debug */
  useEffect(() => {
    if (!debug || !navMesh || !inputMeshGeometry) return

    const triMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
    })

    const debugDrawer = new DebugDrawer({ triMaterial })
    debugDrawer.renderOrder = 1
    debugDrawer.drawNavMeshPolysWithFlags(navMesh, 1, 0x0000ff)

    debugDrawer.position.y += 0.02

    scene.add(debugDrawer)

    const inputMaterial = new MeshBasicMaterial({
      color: 'orange',
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.3,
    })

    const inputMesh = new Mesh(inputMeshGeometry, inputMaterial)

    scene.add(inputMesh)

    return () => {
      scene.remove(debugDrawer)
      scene.remove(inputMesh)

      debugDrawer.dispose()
    }
  }, [navMesh, inputMeshGeometry, debug])

  const context = useMemo(() => ({ navMesh, walkableMesh }), [navMesh, walkableMesh])

  return (
    <>
      <NavigationContext.Provider value={context}>
        {children}

        {walkableMesh && <primitive object={walkableMesh} />}
      </NavigationContext.Provider>
    </>
  )
}

const _origin = new Vector3()
const _direction = new Vector3(0, -1, 0)
const _raycaster = new Raycaster(_origin, _direction, 0, 10)

function ExampleAgents() {
  const { navMesh, walkableMesh } = useNavigation()

  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  const cameraNavMeshPosition = useRef(new Vector3())

  const [crowd, setCrowd] = useState<Crowd | null>(null)
  const [crowdHelper, setCrowdHelper] = useState<CrowdHelper | null>(null)

  const lastTeleportTime = useRef(0)

  useFrame(({ clock: { elapsedTime } }, delta) => {
    if (!walkableMesh || !crowd) return

    /* find our current position on the navmesh */
    _origin.copy(camera.position)

    const hits = _raycaster.intersectObject(walkableMesh, true)
    const hit = hits[0]

    if (hit) {
      cameraNavMeshPosition.current.copy(hit.point)
    }

    /* move towards the player, teleport every 10s (placeholder) */
    if (elapsedTime - lastTeleportTime.current > 10) {
      for (const agent of Object.values(crowd.agents)) {
        agent.teleport(cameraNavMeshPosition.current)
      }

      lastTeleportTime.current = elapsedTime
    } else {
      for (const agent of Object.values(crowd.agents)) {
        agent.requestMoveTarget(cameraNavMeshPosition.current)
      }
    }

    /* update the crowd */
    crowd.update(delta)

    if (crowdHelper) {
      crowdHelper.update()
    }
  })

  /* create the crowd and agents */
  useEffect(() => {
    if (!navMesh) return

    const nAgents = 2

    const crowd = new Crowd(navMesh, { maxAgents: nAgents, maxAgentRadius: NAVIGATION_CONFIG.walkableRadius })

    for (let i = 0; i < nAgents; i++) {
      crowd.addAgent(cameraNavMeshPosition.current, { radius: 0.2, height: 0.5, maxSpeed: 1 })
    }

    const crowdHelper = new CrowdHelper(crowd)

    setCrowd(crowd)
    setCrowdHelper(crowdHelper)

    return () => {
      setCrowd(null)
      setCrowdHelper(null)

      crowd.destroy()
    }
  }, [navMesh])

  return <>{crowdHelper && <primitive object={crowdHelper} />}</>
}
