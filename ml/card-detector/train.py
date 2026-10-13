"""YOLO eğitimi. Kullanım: uv run python train.py --epochs 60 [--name deneme]"""
import argparse
from pathlib import Path

from ultralytics import YOLO

HERE = Path(__file__).parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="yolo26n.pt")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--name", default="cards")
    args = parser.parse_args()
    model = YOLO(args.model)
    model.train(
        data=str(HERE / "data" / "synth" / "data.yaml"),
        epochs=args.epochs,
        imgsz=640,
        batch=args.batch,
        device=0,
        workers=6,
        project=str(HERE / "runs"),
        name=args.name,
        exist_ok=True,
        # Ayna çevirme rakamları bozar (ör. 7, J); dönüş ve perspektif zaten sentetik veride var.
        fliplr=0.0,
        flipud=0.0,
        degrees=0.0,
        mosaic=0.5,
        close_mosaic=10,
        hsv_h=0.02,
        patience=20,
    )


if __name__ == "__main__":
    main()
