import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("token"));

  // Set axios default headers

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      // Fetch user data
      axios
        .get(`${API_BASE_URL}/api/auth/me`)
        .then(response => {
          setUser(response.data.user);
          setLoading(false);
        })
        .catch(() => {
          // Invalid token
          localStorage.removeItem("token");
          setToken(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const signup = async (email, password) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/signup`, {
        email,
        password,
      });
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem("token", newToken);
      setToken(newToken);
      setUser(newUser);
      axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || "Signup failed",
      };
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password,
      });
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem("token", newToken);
      setToken(newToken);
      setUser(newUser);
      axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || "Login failed",
      };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];
  };

  const regenerateApiKey = async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/regenerate-key`
      );
      setUser({ ...user, apiKey: response.data.apiKey });
      return { success: true, apiKey: response.data.apiKey };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || "Failed to regenerate API key",
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        signup,
        login,
        logout,
        regenerateApiKey,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
