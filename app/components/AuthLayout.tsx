import React from 'react';
import '../styles/auth.scss';
import Logo from './Logo';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl w-full bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Image Section - Hidden on mobile/tablet */}
          <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-green-400 to-blue-500 items-center justify-center p-0">
            <div className="w-full h-full flex items-center justify-center">
              <img 
                src="/formImage.svg" 
                alt="SiLagung Smart Farming" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          
          {/* Form Section */}
          <div className="w-full lg:w-1/2 p-8 lg:p-12">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <Logo />
              </div>
              <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
              <p className="text-sm text-gray-600">{subtitle}</p>
            </div>
            <div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}