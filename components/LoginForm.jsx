"use client"

import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import bokuLogo from "@/components/assets/img/Logo.png"

const LoginForm = () => {

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Username:', username);
    console.log('Password:', password);
  }



  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-[#f5f4f2]">
      <div className="bg-[#FCFBF9] rounded-xl shadow-lg flex flex-col items-center p-10 w-[400px]">
        <div className="flex flex-row items-center gap-9 w-full mb-6">
          <div className="flex items-center h-full">
            <Image src={bokuLogo} alt="Boku Logo" width={150} height={150} className="object-contain" />
          </div>
          <span className="text-black text-[25px] font-medium leading-tight">Universität für<br />Bodenkultur Wien</span>
        </div>
        <div className="text-black text-5xl font-bold mb-8 text-center w-full">Fish Database</div>
        <input
          type="text"
          id="username"
          name="username"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
        />
        <input
          type="password"
          id="password"
          name="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-6 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
        />
        <button onClick={handleSubmit} type="submit" className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium  hover:bg-[#4da1a6] transition-colors duration-200 mb-4">Sign in</button>
        <Link href="/forgot-password" className="text-black text-base font-normal w-full text-center mb-4">Forgot password?</Link>
      </div>
    </div>
  )
}

export default LoginForm