# External Merge Sort Visualization (Flask)

Ứng dụng web mô phỏng thuật toán **External Merge Sort** với giao diện trực quan:
- Chunking dữ liệu
- K-way merge bằng min-heap
- Theo dõi RAM / Merge / Output theo từng bước
- Pause / Resume animation

## 1) Yêu cầu môi trường

- Python 3.10+ (khuyến nghị)
- pip

## 2) Cài đặt và chạy

### Cách A: Chạy trực tiếp bằng Python

```bash
# tại thư mục ExtSort
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install flask numpy
python app.py
```

Mở trình duyệt tại: `http://127.0.0.1:5000`

### Cách B: Chạy bằng Docker

```bash
# tại thư mục ExtSort
docker build -t exsort .
docker run -p 5000:5000 exsort
```

Mở: `http://127.0.0.1:5000`

## 3) Cách sử dụng

### Bước 1: Nạp dữ liệu
Có 2 cách:
1. **Upload TXT File**
2. **Generate Random Data**

### Bước 2: Cấu hình
- **Chunk Size**: kích thước mỗi chunk
- **K-way Merge**: số lượng run/chunk merge cùng lúc
- **Speed**: tốc độ animation (ms)

### Bước 3: Chạy mô phỏng
- Nhấn **Start Sort** để bắt đầu
- Nhấn **Pause / Resume** để tạm dừng/tiếp tục
- Nhấn **Download Sorted TXT** để tải kết quả đã sort

## 4) Định dạng input được hỗ trợ

Khi upload file, app tự nhận diện theo thứ tự:
1. **Binary 8-bit dạng text** (mỗi token là 8 ký tự `0/1`, ví dụ `01101001`)
2. **TXT số thường** (các số cách nhau bởi khoảng trắng, xuống dòng, `,` hoặc `;`)
3. **Binary float64 thô** (8 bytes mỗi số, little-endian)

Nếu không khớp các định dạng trên, app sẽ báo lỗi file không hợp lệ.

## 5) Các vùng hiển thị chính

- **Input**: dữ liệu ban đầu
- **Chunking Timeline**: lịch sử các bước chunking/merge pass
  - Có tùy chọn **Show all timeline steps**
  - Nếu tắt: chỉ hiển thị bước timeline mới nhất
  - Toggle này chỉ đổi được khi **chưa chạy** hoặc đang **Pause**
- **RAM**: vùng dữ liệu đang xử lý trong bộ nhớ
- **K-way Merge**: trạng thái các chunk/runs khi merge
  - Có highlight phần tử/chunk đang được lấy
- **Min Heap (Binary Tree)**: cây min-heap đang dùng để pop phần tử nhỏ nhất
- **Output**: kết quả đầu ra đang được xây dựng

## 6) Chế độ dữ liệu lớn

Ngưỡng hiện tại: **>= 1,000 phần tử**.

Khi dữ liệu đạt ngưỡng này, app sẽ:
- Tắt animation chi tiết để tránh lag
- Sort trực tiếp
- Vẫn hiển thị output và trạng thái hoàn tất

## 7) API backend chính (Flask)

- `GET /` -> trang chính
- `POST /api/generate-random` -> tạo dữ liệu ngẫu nhiên
- `POST /api/sort` -> sort mảng số (API test)
- `POST /api/download-txt` -> trả file TXT đã sort

## 8) Lưu ý

- Nếu chỉnh `Chunk Size` hoặc `K-way Merge` trong lúc đang chạy, phiên sort hiện tại sẽ bị hủy để tránh conflict.
- Nếu giao diện không cập nhật style mới, hãy hard refresh trình duyệt (`Ctrl + F5`).
