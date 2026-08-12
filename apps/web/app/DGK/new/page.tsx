'use client';

import { useState, useRef, ChangeEvent } from 'react';

export default function NewKaizenPage() {
  const [desc, setDesc] = useState('');
  const [img, setImg] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError(`File too large! Max 10MB. Current: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
      setImg(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type! Please upload PNG, JPG, or HEIC.');
      setImg(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setError(null);
    setImg(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleRemove = () => {
    setImg(null);
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!desc || !img) {
      setError('Please fill all fields and upload an image');
      return;
    }
    setError(null);
    setLoading(true);

    await new Promise((r) => setTimeout(r, 1000)); // Mock API

    alert('Kaizen started!');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">New Kaizen</h1>
          <p className="text-gray-600">Capture the problem before starting the improvement.</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          {/* User Context */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row justify-between gap-3">
            <div><p className="font-medium">Marcus Chen</p><p className="text-xs text-gray-500">Raised by</p></div>
            <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>
            <div><p className="font-medium">Assembly Line B</p><p className="text-xs text-gray-500">Department</p></div>
            <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>
            <div><p className="font-medium">{new Date().toLocaleDateString()}</p><p className="text-xs text-gray-500">Date</p></div>
          </div>

          {/* Error Message */}
          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

          {/* Problem Description */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              What is the problem? <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black resize-none"
              rows={4}
              placeholder="Describe the inefficiency, safety risk, or quality issue..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              required
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Before photo <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${preview ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'}
              `}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png, image/jpeg, image/heic, image/heif"
                className="hidden"
                onChange={handleFile}
              />

              {preview ? (
                <div className="space-y-3">
                  <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded shadow-sm" />
                  <button type="button" onClick={handleRemove} className="text-red-500 text-sm hover:underline">
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="mx-auto w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-700">Click to upload or drag & drop</p>
                  <p className="text-xs text-gray-500">PNG, JPG or HEIC (max. 10MB)</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t">
            <button
              onClick={() => window.history.back()}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Save Draft
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              ) : (
                <>
                  Start Improvement <span>→</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}