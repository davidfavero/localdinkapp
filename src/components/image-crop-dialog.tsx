'use client';

import { useState, useCallback } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface ImageCropDialogProps {
  image: string;
  onCropComplete: (croppedAreaPixels: Area) => void;
  onClose: () => void;
}

export function ImageCropDialog({ image, onCropComplete, onClose }: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onRealCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = () => {
    if (croppedAreaPixels) {
      onCropComplete(croppedAreaPixels);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crop Your Profile Picture</DialogTitle>
        </DialogHeader>
        <div className="relative h-64 w-full bg-muted">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onRealCropComplete}
            showGrid
          />
        </div>
        <div className="space-y-2">
            <label htmlFor="zoom" className="text-sm font-medium">Zoom</label>
            <Slider
                id="zoom"
                min={1}
                max={3}
                step={0.1}
                value={[zoom]}
                onValueChange={(value) => setZoom(value[0])}
            />
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
