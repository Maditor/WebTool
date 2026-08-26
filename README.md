# WebTool — Cắt & Ghép Ảnh, Đổi Tên, Gắn Logo

Công cụ xử lý ảnh chạy hoàn toàn phía client (không cần server), dùng để hỗ trợ dựng webtoon/truyện tranh: ghép — cắt lại ảnh theo chiều cao, đổi tên file hàng loạt, và gắn logo lên toàn bộ ảnh.

- **Trên trình duyệt**: mở 'https://maditor.github.io/WebTool/'


## Các chức năng

Chuyển đổi qua lại giữa các chức năng bằng thanh nút phía trên khung cài đặt.

### 1. Cắt & Ghép Ảnh
Ghép toàn bộ ảnh trong thư mục thành 1 dải dài rồi cắt lại theo chiều cao mong muốn — dùng khi cần chia lại 1 chương truyện thành các ảnh có chiều cao đồng đều.

- **Tự Động**: ghép xong sẽ tự dò điểm cắt an toàn (né các dòng có chi tiết/màu thay đổi) quanh mốc chiều cao đã đặt, tránh cắt ngang mặt/chữ. Có thể chỉnh thêm ở phần "Cài đặt nâng cao" (vùng dò, ngưỡng nhạy màu) nếu cần.
- **Cố Định**: cắt đúng theo chiều cao đã nhập (px), không dò điểm cắt — nhanh hơn nhưng có thể cắt ngang chi tiết ảnh.
- Có thể chọn định dạng xuất (.jpg/.webp/.png), chất lượng nén, và cách xử lý khi các ảnh không cùng chiều rộng.

### 2. Đổi Tên File
Đổi tên hàng loạt ảnh trong thư mục theo thứ tự (VD: `001.jpg, 002.jpg, ...`), có thể tùy chỉnh số chữ số và đổi đuôi file.

### 3. Gắn Logo
Chèn 1 logo/watermark lên toàn bộ ảnh trong thư mục, tùy chỉnh kích thước, độ mờ, vị trí và khoảng đệm.

## Chọn thư mục vào / ra

- **Chạy trên trình duyệt hỗ trợ File System Access API** (Chrome/Edge): có thể chọn thư mục xuất và ghi trực tiếp, không cần tải về.

## Lưu cài đặt

Mọi thông số bạn chỉnh (định dạng, chất lượng, chế độ cắt, cài đặt đổi tên, cài đặt logo...) và đường dẫn thư mục đều được tự động lưu lại:


- **Bản web**: lưu vào `localStorage` của trình duyệt. Do giới hạn bảo mật, trình duyệt không lưu được quyền truy cập thư mục — bạn cần bấm "Duyệt" chọn lại thư mục ảnh mỗi khi mở lại, các thông số khác vẫn được giữ nguyên.

## Yêu cầu

- Trình duyệt hiện đại (Chrome, Edge, hoặc Chromium-based) để có đầy đủ tính năng chọn/ghi thư mục.
- Không yêu cầu cài đặt thư viện hay server — mọi xử lý ảnh diễn ra ngay trên máy người dùng.
