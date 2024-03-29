"use client";

import React, { useContext, useRef } from "react";
import { ScrollContext } from "@/utils/scroll-observer";

const Masthead: React.FC = () => {
  const refContainer = useRef<HTMLDivElement>(null);
  const { scrollY } = useContext(ScrollContext);

  let progress = 0;

  const { current: elContainer } = refContainer;
  if (elContainer) {
    progress = Math.min(1, scrollY / elContainer.clientHeight);
  }

  return (
    <div
      ref={refContainer}
      className="min-h-screen flex flex-col items-center justify-center sticky top-0 -z-10"
      style={{
        transform: `translateY(-${progress * 20}vh)`,
      }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute w-full h-full object-cover"
      >
        <source src="/background.mp4" type="video/mp4" />
        <source src="/background.webm" type="video/webm" />
      </video>
      <div className="p-12 font-bold z-10 text-gray-100 drop-shadow-[0_3px_5px_rgba(0,0,0,0.4)] text-center flex-1 flex flex-col items-center justify-center">
        <h1 className="mb-6 text-4xl xl:text-5xl">
          Pengtao &quot;Machearn&quot; Ning
        </h1>
        <h2 className="mb-2 text-2xl xl:text-3xl">
          <span>Digital Creator</span>{" "}
          <span>(Photographer/Full Stack Developer)</span>
        </h2>
      </div>
      <div className="drop-shadow-[0_3px_5px_rgba(0,0,0,0.4)] flex-grow-0 pb-20 mb:pb-10 transition-all duration-1000">
        <svg
          className="w-[48px] h-[48px] text-gray-100"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="m19 9-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
};

export default Masthead;
