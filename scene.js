// scene.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export let walls = [];
export let currentModel = null;
export let oldModel = null;
export let transitionData = null;

export function isTransitioning() {
    return transitionData !== null;
}

export function updateTransition() {
    if (!transitionData || !currentModel || !oldModel) return;
    
    transitionData.time += 0.007; // Tốc độ lướt
    
    let t = transitionData.time;
    if (t >= 1) {
        t = 1;
    }
    
    // Sử dụng easeInOutCubic để mượt mà
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    
    const dir = transitionData.direction;
    
    // Mẫu cũ trượt ra ngoài
    oldModel.position.x = -40 * dir * ease;
    oldModel.position.z = 40 * dir * ease;
    
    // Mẫu mới trượt vào
    currentModel.position.x = 40 * dir * (1 - ease);
    currentModel.position.z = -40 * dir * (1 - ease);
    
    if (t === 1) {
        if (oldModel.parent) {
            oldModel.parent.remove(oldModel);
        }
        oldModel = null;
        transitionData = null;
    }
}

export const cameraParams = {
    radius: 20, // Tăng radius lên chút để chắc chắn không bị cắt hình
    angleY: Math.PI / 4,
    angleX: Math.atan(1 / Math.sqrt(2)), // Góc nghiêng chuẩn cho Isometric (khoảng 35.264 độ)
    center: new THREE.Vector3(0, 4.5, 0) // Nâng điểm nhìn lên trục Y để đẩy phòng xuống thấp
};

export function updateCamera(camera, params) {
    camera.position.x = params.center.x + params.radius * Math.sin(params.angleY) * Math.cos(params.angleX);
    camera.position.y = params.center.y + params.radius * Math.sin(params.angleX);
    camera.position.z = params.center.z + params.radius * Math.cos(params.angleY) * Math.cos(params.angleX);

    camera.lookAt(params.center);
}

export function setupScene() {
    const scene = new THREE.Scene();
    // Chỉnh màu nền giống với tông màu tối trong ảnh
    scene.background = new THREE.Color(0x2a363b);

    const aspect = window.innerWidth / window.innerHeight;
    const d = 12.5; // Chỉnh d = 11 để phòng nhỏ lại vừa khung hình
    const camera = new THREE.OrthographicCamera(
        -d * aspect, d * aspect, d, -d, 0.1, 1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Thêm ánh sáng để thấy được Model
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(5, 10, 7.5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    const light2 = new THREE.DirectionalLight(0xffffff, 3);
    light2.position.set(-5, 10, -7.5);
    scene.add(light2);
    scene.add(new THREE.AmbientLight(0x404040));

    // Gọi hàm loadRoom để tải phòng mặc định
    // loadRoom(scene, '/models/main_room.glb'); // Chúng ta sẽ gọi từ main.js

    return { scene, camera, renderer };
}

export function loadRoom(scene, roomUrl, transitionDirection = 1) {
    if (transitionData && oldModel) {
        if (oldModel.parent) oldModel.parent.remove(oldModel);
        if (currentModel) currentModel.position.set(0, 0, 0);
        oldModel = null;
        transitionData = null;
    }

    const loader = new GLTFLoader();
    loader.load(
        roomUrl,
        function (gltf) {
            const newModel = gltf.scene;
            scene.add(newModel);
            
            // Xóa walls cũ để tính cho model mới
            walls = [];

            // 0. Gộp các phần của object thành 1 group để tương tác chung
            let c092_1 = null, c092_2 = null;
            let c075_1 = null, c075_2 = null;
            
            gltf.scene.traverse((child) => {
                const lowerName = child.name.toLowerCase();
                if (lowerName === 'cube092') c092_1 = child;
                if (lowerName === 'cube092_1' || lowerName === 'cube092 1') c092_2 = child;
                
                if (lowerName === 'cube075') c075_1 = child;
                if (lowerName === 'cube075_1' || lowerName === 'cube075 1') c075_2 = child;
            });

            if (c092_1 && c092_2) {
                const group = new THREE.Group();
                group.name = 'Cube092_Merged'; // Tên chung sau khi gộp
                if (c092_1.parent) c092_1.parent.add(group);
                else scene.add(group);
                group.add(c092_1);
                group.add(c092_2);
                console.log('Đã gộp', c092_1.name, 'và', c092_2.name, 'thành 1 group:', group.name);
            }

            if (c075_1 && c075_2) {
                const group = new THREE.Group();
                group.name = 'Cube075_Merged'; // Tên chung sau khi gộp
                if (c075_1.parent) c075_1.parent.add(group);
                else scene.add(group);
                group.add(c075_1);
                group.add(c075_2);
                console.log('Đã gộp', c075_1.name, 'và', c075_2.name, 'thành 1 group:', group.name);
            }

            // --- Gắn vật phẩm vào ngăn kéo (cube022) ---
            gltf.scene.updateMatrixWorld(true);
            let drawer = null;
            gltf.scene.traverse((child) => {
                if (child.name.toLowerCase() === 'cube022') drawer = child;
            });

            if (drawer) {
                const drawerBox = new THREE.Box3().setFromObject(drawer);
                drawerBox.expandByScalar(0.15); // Mở rộng thêm một xíu để đảm bảo bắt được đồ nằm sát viền

                const itemsInside = [];
                gltf.scene.traverse((child) => {
                    if (child.isMesh && child !== drawer) {
                        const lowerName = child.name.toLowerCase();
                        // Bỏ qua tường, sàn, phòng, và các loại cửa/tường
                        if (lowerName.includes('wall') || lowerName.includes('floor') || lowerName.includes('room') || lowerName.includes('door') || lowerName.startsWith('f_')) return;

                        const box = new THREE.Box3().setFromObject(child);
                        const center = box.getCenter(new THREE.Vector3());

                        // Nếu tâm của đồ vật nằm bên trong ngăn kéo
                        if (drawerBox.containsPoint(center)) {
                            let target = child;
                            if (child.parent && child.parent.name.includes('_Merged')) {
                                target = child.parent; // Lấy cả group nếu đã được gộp
                            }
                            
                            // Đảm bảo đồ vật phải nhỏ hơn cái tủ (tránh gắn nhầm vỏ tủ)
                            const targetBox = new THREE.Box3().setFromObject(target);
                            const targetSize = targetBox.getSize(new THREE.Vector3());
                            const drawerSize = drawerBox.getSize(new THREE.Vector3());
                            
                            if (targetSize.lengthSq() < drawerSize.lengthSq() * 0.8) {
                                if (!itemsInside.includes(target)) {
                                    itemsInside.push(target);
                                }
                            }
                        }
                    }
                });

                itemsInside.forEach(item => {
                    drawer.attach(item);
                    console.log('Đã gắn', item.name, 'vào trong tủ', drawer.name);
                });
            }
            // 1. Tìm và lưu các bức tường
            gltf.scene.traverse((child) => {
                if (child.name.startsWith('Wall')) {
                    const box = new THREE.Box3().setFromObject(child);
                    const center = box.getCenter(new THREE.Vector3());
                    walls.push({
                        box: box,
                        center: center,
                        items: [{
                            mesh: child,
                            originalY: child.position.y,
                            targetY: child.position.y
                        }],
                        isInitialized: false
                    });
                }
            });

            // 2. Tìm các object nằm sát tường (tranh, cửa, kệ, rèm...) và ghép chung vào tường đó
            gltf.scene.children.forEach((child) => {
                // Bỏ qua tường, sàn, ghế sofa và cuốn sách Fiction book.014
                if (child.name.startsWith('Wall') || child.name.toLowerCase().includes('floor') || child.name.startsWith('F_') || child.name.toLowerCase().includes('sofa') || child.name.toLowerCase().includes('Fiction book.014')) return;

                const box = new THREE.Box3().setFromObject(child);
                if (box.isEmpty()) return;

                const center = box.getCenter(new THREE.Vector3());
                let closestWall = null;
                let minDistance = Infinity;

                walls.forEach(wall => {
                    const dist = wall.box.distanceToPoint(center);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestWall = wall;
                    }
                });

                // Nếu khoảng cách đến tường < 2.5 đơn vị, coi như object này bám sát tường
                if (closestWall && minDistance < 2.5) {
                    closestWall.items.push({
                        mesh: child,
                        originalY: child.position.y,
                        targetY: child.position.y
                    });
                }
            });

            if (currentModel) {
                oldModel = currentModel;
                transitionData = {
                    time: 0,
                    direction: transitionDirection
                };
                newModel.position.x = 40 * transitionDirection;
                newModel.position.z = -40 * transitionDirection;
            }
            currentModel = newModel;

            console.log('Model loaded successfully! Walls found:', walls.length);
        },
        undefined,
        function (error) {
            console.error('An error happened while loading the model:', error);
        }
    );
}

export function updateWalls(camera) {
    if (walls.length === 0) return;

    // Tính khoảng cách từ mỗi tường đến camera
    walls.forEach(wall => {
        wall.distance = wall.center.distanceToSquared(camera.position);
    });

    // Sắp xếp tường theo khoảng cách (từ gần nhất đến xa nhất)
    const sortedWalls = [...walls].sort((a, b) => a.distance - b.distance);

    // 2 tường gần nhất sẽ được nhấc lên, các tường kia giữ nguyên
    sortedWalls.forEach((wall, index) => {
        const targetOffset = (index < 2) ? 50 : 0; // Tường gần đưa lên cao 50 đơn vị

        wall.items.forEach(item => {
            item.targetY = item.originalY + targetOffset;
            if (!wall.isInitialized) {
                // Đặt vị trí lập tức ở lần đầu tiên để không thấy tường bay lên
                item.mesh.position.y = item.targetY;
            } else {
                // LERP để di chuyển mượt mà
                item.mesh.position.y += (item.targetY - item.mesh.position.y) * 0.1;
            }
        });
        wall.isInitialized = true;
    });
}