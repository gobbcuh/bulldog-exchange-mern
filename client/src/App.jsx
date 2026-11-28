
import {
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AdminRoute from "./components/AdminRoute";
import AdminLayout from "./components/AdminLayout";

import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MyOrders from "./pages/MyOrders";
import Checkout from "./pages/Checkout";
import AdminProducts from "./pages/AdminProducts";
import AdminDashboard from "./pages/AdminDashboard";
import AdminOrders from "./pages/AdminOrders";

import "./App.css";

function App() {
  const location = useLocation();
  const isAdminPage =
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/");

  return (
    <>
      {!isAdminPage && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route
          path="/products/:id"
          element={<ProductDetails />}
        />
        <Route path="/cart" element={<Cart />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/orders" element={<MyOrders />} />
        <Route path="/checkout" element={<Checkout />} />

        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route
              path="/admin"
              element={<AdminDashboard />}
            />
            <Route
              path="/admin/products"
              element={<AdminProducts />}
            />
            <Route
              path="/admin/orders"
              element={<AdminOrders />}
            />
          </Route>
        </Route>
      </Routes>

      {!isAdminPage && <Footer />}
    </>
  );
}

export default App;
