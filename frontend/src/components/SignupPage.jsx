import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import axios from "axios";

export default function SignupPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const navigate = useNavigate();

    const handleSignup = async () => {
        setError("");

        if (!username || !password || !confirmPassword) {
            setError("All fields are required");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match!");
            return;
        }

        try {
            const res = await axios.post("http://localhost:5000/api/signup", {
                username, password,
            });
            alert(res.data.message || "Account created successfully!");
            navigate("/");
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || "Signup failed. Try again.");
        }
    };

    return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="absolute top-0 left-0 right-0 bg-green-800 h-2"></div>
            <div className="absolute top-2 left-0 right-0 bg-white py-4 px-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-green-800">Automate</h1>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl w-96 shadow-xl border-t-4 border-green-600 mt-16">
                <h2 className="text-3xl font-bold text-green-700 text-center mb-6">
                    Create your Account
                </h2>

                {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-center text-sm">
                        {error}
                    </div>
                )}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-green-800 mb-2">Username</label>
                        <input
                            type="text"
                            placeholder="Username"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-green-800 mb-2">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition pr-12"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-gray-300 hover:text-green-800 transition"
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-green-800 mb-2">Confirm Password</label>
                        <div className="relative">
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm Password"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition pr-12"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-3 text-gray-400 hover:text-gray-800 transition">
                                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={handleSignup}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition-all">
                        Sign up
                    </button>
                </div>

                <p className="mt-4 text-center text-gray-600">
                    Already have an account?{" "}
                    <Link to="/" className="text-green-700 font-semibold hover:underline">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    );
}