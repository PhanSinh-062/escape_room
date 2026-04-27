import * as THREE from 'three';
import { setupScene, cameraParams, updateWalls, loadRoom, updateTransition, isTransitioning } from './scene.js';
import { initControls } from './control.js';

const { scene, camera, renderer } = setupScene();

let currentRoom = 'main_room';
loadRoom(scene, '/models/main_room.glb');

// Khởi tạo bộ điều khiển
initControls(camera, cameraParams);

// --- TƯƠNG TÁC ĐỒ VẬT (RAYCASTING) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hideTimeout;

window.addEventListener('click', (event) => {
    // Bỏ qua click nếu người dùng đang bấm vào khung túi đồ
    if (event.target.closest('#inventory-container')) return;

    if (isTransitioning()) return;

    // Chuyển đổi tọa độ chuột sang NDC (-1 đến +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Cập nhật tia ray
    raycaster.setFromCamera(mouse, camera);

    // Tìm các điểm giao cắt
    const intersects = raycaster.intersectObjects(scene.children, true);

    // --- KIỂM TRA CHUYỂN PHÒNG VỚI DOOR004 ---
    let door004Clicked = false;
    scene.traverse((child) => {
        if (child.name && (child.name.toLowerCase().includes('door004') || child.name.toLowerCase().includes('door.004'))) {
            const box = new THREE.Box3().setFromObject(child);
            const boxIntersection = raycaster.ray.intersectBox(box, new THREE.Vector3());
            if (boxIntersection) {
                const distanceToBox = raycaster.ray.origin.distanceTo(boxIntersection);
                // Nếu không bị cản bởi object nào, hoặc Box của cửa nằm gần hơn/cùng khoảng cách với object bị click
                if (intersects.length === 0 || distanceToBox <= intersects[0].distance + 0.5) {
                    door004Clicked = true;
                }
            }
        }
    });

    if (door004Clicked) {
        if (currentRoom === 'main_room') {
            loadRoom(scene, '/models/kitchen.glb', 1);
            currentRoom = 'kitchen';
            showObjectName("Phòng ăn");
        } else if (currentRoom === 'kitchen') {
            loadRoom(scene, '/models/main_room.glb', -1);
            currentRoom = 'main_room';
            showObjectName("Phòng khách");
        }
        return;
    }

    if (intersects.length > 0) {
        let clickedObject = intersects[0].object;
        
        // Nếu object là một phần của Group đã gộp, ta lấy Group đó làm đối tượng chính
        if (clickedObject.parent && clickedObject.parent.name.includes('_Merged')) {
            clickedObject = clickedObject.parent;
        }

        // Bỏ qua tường và sàn nhà, chỉ quan tâm đồ vật
        const nameLowerCase = clickedObject.name.toLowerCase();
        if (nameLowerCase.includes('wall') || nameLowerCase.includes('floor') || nameLowerCase.includes('room')) {
            return; 
        }

        // --- XỬ LÝ NHẶT VẬT PHẨM ---
        // Khi bấm vào đồ vật có thể nhặt và nó chưa bị ẩn
        if ((clickedObject.name === 'Cube092_Merged' || clickedObject.name === 'Cube075_Merged' || nameLowerCase.includes('key001') || nameLowerCase.includes('cylinder002') || nameLowerCase.includes('cylinder.002') || nameLowerCase.includes('paper')) && clickedObject.visible !== false) {
            // 1. Thêm vào túi đồ bằng cách chụp ảnh vật thể
            addToInventory(clickedObject);
            // 2. Làm biến mất khỏi phòng 3D
            clickedObject.visible = false;
            // 3. Hiện thông báo
            showObjectName("Đã nhặt đồ vật!");
            return;
        }

        // --- XỬ LÝ MỞ CỬA DOOR RIGHT001 ---
        if (nameLowerCase.includes('door right001') || nameLowerCase.includes('door_right001') || nameLowerCase.includes('door right.001')) {
            toggleDoor(clickedObject, 1); // Góc xoay dương
            return;
        }

        // --- XỬ LÝ MỞ CỬA DOOR LEFT001 ---
        if (nameLowerCase.includes('door left001') || nameLowerCase.includes('door_left001') || nameLowerCase.includes('door left.001')) {
            // Cánh bên trái thường xoay ngược chiều so với cánh bên phải để cùng mở ra ngoài
            toggleDoor(clickedObject, -1); 
            return;
        }

        // --- XỬ LÝ KÉO NGĂN KÉO/TỦ ---
        if (nameLowerCase.includes('cube022')) {
            // Giả định kéo ra theo trục z một khoảng 0.6 đơn vị. 
            // Nếu sai hướng (kéo sang ngang hoặc đâm vào tường), ta có thể đổi 'z' thành 'x' hoặc thêm dấu âm.
            toggleDrawer(clickedObject, 'z', 0.6); 
            return;
        }

        // Vô hiệu hóa hoàn toàn tương tác trực tiếp với door002
        if (nameLowerCase.includes('door002') || nameLowerCase.includes('door.002')) {
            return;
        }

        showObjectName(clickedObject.name);
    }
});

function hasItemInInventory(namePart) {
    const items = document.querySelectorAll('.slot img');
    for (let img of items) {
        if (img.dataset.itemName && img.dataset.itemName.toLowerCase().includes(namePart.toLowerCase())) {
            return true;
        }
    }
    return false;
}

const animatingDoors = [];
const animatingDrawers = [];

function toggleDrawer(drawer, axis = 'z', distance = 0.6) {
    if (drawer.userData.isOpen === undefined) {
        drawer.userData.originalPosition = drawer.position.clone();
        drawer.userData.isOpen = false;
    }

    drawer.userData.isOpen = !drawer.userData.isOpen;

    if (drawer.userData.isOpen) {
        drawer.userData.targetPosition = drawer.userData.originalPosition.clone();
        drawer.userData.targetPosition[axis] += distance; 
        showObjectName("Đã mở tủ!");
    } else {
        drawer.userData.targetPosition = drawer.userData.originalPosition.clone();
        showObjectName("Đã đóng tủ!");
    }

    if (!animatingDrawers.includes(drawer)) {
        animatingDrawers.push(drawer);
    }
}

function toggleDoor(door, direction = 1) {
    if (door.userData.isOpen === undefined) {
        door.userData.originalRotation = door.rotation.clone();
        door.userData.isOpen = false;
    }

    door.userData.isOpen = !door.userData.isOpen;

    if (door.userData.isOpen) {
        door.userData.targetRotation = door.userData.originalRotation.clone();
        // Xoay 90 độ (PI/2). Hướng xoay phụ thuộc vào tham số direction (1 hoặc -1)
        door.userData.targetRotation.y += (Math.PI / 2) * direction; 
        showObjectName("Đã mở cửa!");
    } else {
        door.userData.targetRotation = door.userData.originalRotation.clone();
        showObjectName("Đã đóng cửa!");
    }

    if (!animatingDoors.includes(door)) {
        animatingDoors.push(door);
    }
}

let thumbRenderer;

// Hàm chụp ảnh 3D vật thể để làm icon
function generateThumbnail(object) {
    if (!thumbRenderer) {
        // Khởi tạo renderer phụ với nền trong suốt
        thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        thumbRenderer.setSize(256, 256);
    }

    const thumbScene = new THREE.Scene();
    
    // Ánh sáng cho studio chụp ảnh
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    thumbScene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(10, 10, 10);
    thumbScene.add(dirLight);

    // Bản sao của vật thể
    const clone = object.clone();
    clone.visible = true; // Chắc chắn nó hiển thị
    
    // Đưa vật thể về gốc tọa độ (0,0,0)
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Trừ đi vị trí tâm để dời object về giữa
    clone.position.sub(center);
    
    // Xoay nhẹ theo phong cách Isometric để dễ nhìn
    clone.rotation.x = Math.PI / 6;
    clone.rotation.y = -Math.PI / 4;

    thumbScene.add(clone);

    // Tính toán kích thước Camera bao trọn vật thể
    const maxDim = Math.max(size.x, size.y, size.z);
    const effectiveMax = maxDim > 0 ? maxDim : 1; 

    // Dùng camera trực giao để ảnh không bị méo góc
    const thumbCamera = new THREE.OrthographicCamera(
        -effectiveMax * 0.8, effectiveMax * 0.8, 
        effectiveMax * 0.8, -effectiveMax * 0.8, 
        0.1, 1000
    );
    thumbCamera.position.set(0, 0, effectiveMax * 2);
    thumbCamera.lookAt(0, 0, 0);

    // Chụp lại thành ảnh PNG
    thumbRenderer.render(thumbScene, thumbCamera);
    return thumbRenderer.domElement.toDataURL("image/png");
}

let paperOverlayRenderer;

function showPaperOverlay(object) {
    let overlay = document.getElementById('paper-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'paper-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.cursor = 'pointer';
        overlay.style.flexDirection = 'column';
        
        const closeBtn = document.createElement('div');
        closeBtn.innerText = '(Click bất kỳ đâu để đóng)';
        closeBtn.style.color = '#ccc';
        closeBtn.style.fontSize = '16px';
        closeBtn.style.marginBottom = '20px';
        closeBtn.style.fontFamily = 'Inter, sans-serif';
        overlay.appendChild(closeBtn);

        overlay.onclick = () => {
            overlay.style.display = 'none';
        };

        const img = document.createElement('img');
        img.id = 'paper-overlay-img';
        img.style.maxWidth = '90%';
        img.style.maxHeight = '80%';
        img.style.objectFit = 'contain';
        img.style.boxShadow = '0 10px 40px rgba(0,0,0,0.8)'; 
        img.style.borderRadius = '4px';
        
        overlay.appendChild(img);
        document.body.appendChild(overlay);
    }

    if (!paperOverlayRenderer) {
        paperOverlayRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        paperOverlayRenderer.setSize(1024, 1024); // Kích thước render độ nét cao
    }

    const scene = new THREE.Scene();
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5); // Sáng mạnh để dễ đọc chữ
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 5, 10);
    scene.add(dirLight);

    const clone = object.clone();
    clone.visible = true;
    
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Đưa giấy về tâm
    clone.position.sub(center);
    
    // Đặt mặt trước hướng về camera. Tờ giấy thường nằm bẹp ngang sàn (mặt phẳng XZ).
    // Xoay quanh trục X một góc 90 độ (PI/2) để nó đứng dựng lên nhìn thẳng vào camera.
    // Nếu tờ giấy bị ngược chữ, ta sẽ đổi chiều rotation sau.
    clone.rotation.set(Math.PI / 2, 0, 0); 

    scene.add(clone);

    const maxDim = Math.max(size.x, size.y, size.z);
    const effectiveMax = maxDim > 0 ? maxDim : 1; 

    // Dùng camera trực giao để giấy không bị méo phối cảnh
    const camera = new THREE.OrthographicCamera(
        -effectiveMax * 0.6, effectiveMax * 0.6, 
        effectiveMax * 0.6, -effectiveMax * 0.6, 
        0.1, 1000
    );
    camera.position.set(0, 0, effectiveMax * 2);
    camera.lookAt(0, 0, 0);

    paperOverlayRenderer.render(scene, camera);
    
    const img = document.getElementById('paper-overlay-img');
    img.src = paperOverlayRenderer.domElement.toDataURL("image/png");
    
    overlay.style.display = 'flex';
}

// Hàm đưa vật phẩm vào ô túi đồ (Inventory)
function addToInventory(object) {
    const slots = document.querySelectorAll('.slot:empty');
    if (slots.length > 0) {
        const firstEmptySlot = slots[0];
        const itemName = object.name;
        
        // Tạo thẻ img và dùng ảnh chụp từ model 3D thực tế
        const itemImg = document.createElement('img');
        itemImg.src = generateThumbnail(object);
        
        // Làm sạch tên để làm tooltip
        let displayName = itemName.replace(/_/g, ' ').replace(/\.\d+$/, '').replace(' Merged', '');
        firstEmptySlot.title = displayName;
        
        // Lưu lại tên gốc để trả về
        itemImg.dataset.itemName = itemName;

        // Sự kiện click vào ảnh để tương tác trong túi đồ
        itemImg.onclick = function(e) {
            e.stopPropagation();
            const targetName = this.dataset.itemName;
            const objectInScene = scene.getObjectByName(targetName);
            if (objectInScene) {
                // Nếu là giấy thì xem phóng to thay vì đặt lại
                if (targetName.toLowerCase().includes('paper')) {
                    showPaperOverlay(objectInScene);
                } else {
                    objectInScene.visible = true;
                    this.parentElement.title = '';
                    this.remove();
                    showObjectName("Đã đặt lại đồ vật!");
                }
            }
        };

        firstEmptySlot.appendChild(itemImg);
    } else {
        showObjectName("Túi đồ đã đầy!");
    }
}

function showObjectName(name) {
    const notif = document.getElementById('object-notification');
    if (!notif) return;
    
    // Dọn dẹp tên object (thay _ bằng khoảng trắng, xóa các số .001 đằng sau do Blender tạo)
    let displayName = name.replace(/_/g, ' ').replace(/\.\d+$/, '');
    
    // Viết hoa chữ cái đầu tiên cho đẹp
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

    notif.innerText = displayName;
    notif.classList.add('show');
    
    // Tự động ẩn sau 2.5 giây
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        notif.classList.remove('show');
    }, 2500);
}
// -------------------------------------

// Render loop
function render() {
    requestAnimationFrame(render);
    updateWalls(camera);
    updateTransition();

    // Xử lý animation cho cửa
    for (let i = animatingDoors.length - 1; i >= 0; i--) {
        const door = animatingDoors[i];
        if (door.userData.targetRotation) {
            door.rotation.y += (door.userData.targetRotation.y - door.rotation.y) * 0.1;
            
            if (Math.abs(door.rotation.y - door.userData.targetRotation.y) < 0.001) {
                door.rotation.y = door.userData.targetRotation.y;
                animatingDoors.splice(i, 1);
            }
        }
    }

    // Xử lý animation cho ngăn kéo
    for (let i = animatingDrawers.length - 1; i >= 0; i--) {
        const drawer = animatingDrawers[i];
        if (drawer.userData.targetPosition) {
            drawer.position.lerp(drawer.userData.targetPosition, 0.1);
            
            if (drawer.position.distanceTo(drawer.userData.targetPosition) < 0.001) {
                drawer.position.copy(drawer.userData.targetPosition);
                animatingDrawers.splice(i, 1);
            }
        }
    }

    renderer.render(scene, camera);
}
render();
