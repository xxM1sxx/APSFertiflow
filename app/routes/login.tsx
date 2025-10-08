import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import AuthLayout from '../components/AuthLayout';
import { signIn } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await signIn(email, password);
      
      if (error) {
        throw error;
      }

      if (data.session) {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout 
      title="Login ke SiLagung" 
      subtitle="Sistem Informasi Smart Farming"
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="error-message">{error}</div>}
        
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email</label>
          <input
            id="email"
            type="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <input
            id="password"
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        
        <button 
          type="submit" 
          className="auth-button"
          disabled={loading}
        >
          {loading ? 'Memproses...' : 'Login'}
        </button>
      </form>
      
      {/* <div className="auth-footer">
        Belum punya akun?{' '}
        <button 
          type="button"
          onClick={() => navigate('/register')}
          className="auth-link bg-transparent border-none p-0 text-blue-600 hover:text-blue-800 cursor-pointer underline"
        >
          Daftar
        </button>
      </div> */}
    </AuthLayout>
  );
}