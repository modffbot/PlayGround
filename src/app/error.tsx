"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="glass rounded-3xl p-10 text-center mx-auto max-w-lg">
    <div className="text-5xl">⚠️</div>
    <h1 className="mt-2 text-xl font-black">حدث خطأ غير متوقع</h1>
    <p className="text-sm text-white/60 mt-1">{error.message}</p>
    <button onClick={reset} className="btn-neon mt-4 rounded-xl px-6 py-2.5 font-bold">إعادة المحاولة</button>
  </div>;
}
