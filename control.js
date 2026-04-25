// control.js
import { updateCamera } from './scene.js';

export function initControls(camera, cameraParams) {
    let isDragging = false;
    let previousMouseX = 0;
    
    // Biến phụ trợ để tạo độ mượt (Damping)
    let targetAngleY = cameraParams.angleY;
    const lerpFactor = 0.1; // Tốc độ đuổi theo (0 đến 1)

    // Ngưỡng vuốt tối thiểu (pixel) để tránh nhận nhầm khi chỉ click
    const swipeThreshold = 30;

    window.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMouseX = e.clientX;
    });

    window.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        
        const deltaX = e.clientX - previousMouseX;
        
        // Nếu khoảng cách vuốt đủ lớn (tránh click nhầm)
        if (Math.abs(deltaX) > swipeThreshold) {
            // Đổi chiều quay:
            // - Vuốt sang phải (deltaX > 0) -> camera xoay trái (-90 độ) -> phòng xoay phải
            // - Vuốt sang trái (deltaX < 0) -> camera xoay phải (+90 độ) -> phòng xoay trái
            if (deltaX > 0) {
                targetAngleY -= Math.PI / 2;
            } else {
                targetAngleY += Math.PI / 2;
            }
        }
    });

    // Hàm vòng lặp để tạo hiệu ứng mượt mà (Animation Loop)
    function animate() {
        requestAnimationFrame(animate);
        
        // Nội suy (LERP) giúp camera xoay từ từ tới vị trí chuột kéo
        cameraParams.angleY += (targetAngleY - cameraParams.angleY) * lerpFactor;
        
        updateCamera(camera, cameraParams);
    }
    
    animate();
}