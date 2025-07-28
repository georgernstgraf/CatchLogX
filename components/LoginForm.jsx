import React from 'react'

const LoginForm = () => {
  return (
    <div>
      <div className='text-[#ff04ca]'>Universität für Bodenkultur Wien</div>
      <div className='text-[#ff04ca]'>Fish Database</div>
      <input
        type="text"
        id="username"
        name="username"
        placeholder="Username"
        required
      />
      
      <input
        type="password"
        id="password"
        name="password"
        placeholder="Password"
        required
      />
      <button type="submit">Login</button>
    </div>

  )
}

export default LoginForm