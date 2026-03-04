from flask import Flask, request, jsonify, render_template, send_file
import numpy as np
import io
import os

app = Flask(__name__)


# =========================
# External Sort simple (numpy)
# =========================
def external_sort(nums):
    arr = np.array(nums, dtype=np.float64)
    arr.sort()
    return arr.tolist()


# =========================
# Routes
# =========================

@app.route('/')
def index():
    return render_template("index.html")


# 1) Generate random test key
@app.route('/api/generate-random', methods=['POST'])
def generate_random():
    d = request.get_json() or {}
    n = int(d.get("n", 10))

    if n <= 0:
        return jsonify({"error": "n phai > 0"}), 400

    nums = np.random.uniform(-1000, 1000, n).astype(np.float64)
    return jsonify({
        "count": n,
        "nums": nums.tolist()
    })


# 2) Sort (receive array)
@app.route('/api/sort', methods=['POST'])
def sort_api():
    d = request.get_json() or {}
    nums = d.get("nums", [])

    if not nums:
        return jsonify({"error": "Khong co du lieu"}), 400

    sorted_nums = external_sort(nums)

    return jsonify({
        "sorted": sorted_nums[:10],
        "count": len(sorted_nums)
    })


# 3) Download sorted output as TXT
@app.route('/api/download-txt', methods=['POST'])
def download_txt():
    d = request.get_json() or {}
    nums = d.get("nums", [])

    if not nums:
        return jsonify({"error": "Khong co du lieu"}), 400

    txt_data = "\n".join(str(x) for x in nums)
    buf = io.BytesIO(txt_data.encode('utf-8'))
    buf.seek(0)

    return send_file(
        buf,
        as_attachment=True,
        download_name="sorted_output.txt",
        mimetype="text/plain; charset=utf-8"
    )
