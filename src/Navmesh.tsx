import { XRMeshModel, XRSpace } from '@react-three/xr'
import { useMemo } from 'react'

export function Navmesh({ mesh }: { mesh: XRMesh }) {
  useMemo(() => {
    //TODO: build actual navmesh with:
    //mesh.indices
    //mesh.vertices
  }, [mesh])
  return (
    <XRSpace space={mesh.meshSpace}>
      <XRMeshModel mesh={mesh}>
        <meshBasicMaterial wireframe />
      </XRMeshModel>
    </XRSpace>
  )
}
