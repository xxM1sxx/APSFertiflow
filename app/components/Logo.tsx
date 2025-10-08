import React from 'react';

export default function Logo() {
  return (
    <div className="flex items-center space-x-2">
      <svg className="w-8 h-8 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v8M4.93 10.93L12 18l7.07-7.07"></path>
        <path d="M2 22h20"></path>
        <path d="M12 18c-4.2 0-7-2.8-7-7 0-3 2-5 4-5 2.5 0 4 2 4 4 0 2.5-2 4-4 4"></path>
        <path d="M12 18c4.2 0 7-2.8 7-7 0-3-2-5-4-5-2.5 0-4 2-4 4 0 2.5 2 4 4 4"></path>
      </svg>
      <span className="text-xl font-bold text-green-700">SiLagung</span>
    </div>
  );
}