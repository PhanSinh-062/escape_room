import * as THREE from 'three';

export function setupRaycaster(camera, scene) {

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('click', (event) => {

        // chuyển tọa độ chuột
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // bắn tia
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object.parent;
console.log("Clicked:", obj.name);
console.log(intersects[0].object);

            if (obj.name === "Box_Test") {
                obj.material.color.set(0xff0000);
            }
        }
    });

    return {};
}