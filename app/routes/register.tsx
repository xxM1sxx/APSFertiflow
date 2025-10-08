import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import AuthLayout from '../components/AuthLayout';
import { signUp } from '../lib/supabase';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Validate required fields
    if (!name.trim()) {
      setError('Nama lengkap harus diisi');
      setLoading(false);
      return;
    }

    if (!phone.trim()) {
      setError('Nomor telepon harus diisi');
      setLoading(false);
      return;
    }

    // Validate phone number format (Indonesian)
    const phoneRegex = /^(\+62|62|0)8[1-9][0-9]{6,9}$/;
    if (!phoneRegex.test(phone)) {
      setError('Format nomor telepon tidak valid. Gunakan format: 08xxxxxxxxxx');
      setLoading(false);
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError('Password tidak cocok');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await signUp(email, password, {
        name,
        phone
      });
      
      if (error) {
        throw error;
      }

      setSuccess('Registrasi berhasil! Silakan cek email Anda untuk verifikasi.');
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Registrasi gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout 
      title="Daftar ke SiLagung" 
      subtitle="Sistem Informasi Smart Farming"
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        
        <div className="form-group">
          <label htmlFor="name" className="form-label">Nama Lengkap</label>
          <input
            id="name"
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        
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
          <label htmlFor="phone" className="form-label">Nomor Telepon</label>
          <input
            id="phone"
            type="tel"
            className="form-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="08xxxxxxxxxx"
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
            minLength={6}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="confirmPassword" className="form-label">Konfirmasi Password</label>
          <input
            id="confirmPassword"
            type="password"
            className="form-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        
        <button 
          type="submit" 
          className="auth-button"
          disabled={loading}
        >
          {loading ? 'Memproses...' : 'Daftar'}
        </button>
      </form>
      
      <div className="auth-footer">
        Sudah punya akun?{' '}
        <button 
          type="button"
          onClick={() => navigate('/')}
          className="auth-link bg-transparent border-none p-0 text-blue-600 hover:text-blue-800 cursor-pointer underline"
        >
          Login
        </button>
      </div>
    </AuthLayout>
  );
}