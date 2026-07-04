#!/bin/bash
# 阿里云服务器状态检查脚本

SERVER="8.148.228.136"
USER="root"

echo "======================================"
echo "阿里云服务器状态检查"
echo "服务器: $SERVER"
echo "======================================"
echo ""

# 使用 sshpass 或直接 SSH（需要手动输入密码）
# 如果您的系统有 sshpass，可以取消下面的注释
# SSHCMD="sshpass -p 'Globalpb5860!' ssh -o StrictHostKeyChecking=no"

# 否则使用普通 SSH（需要手动输入密码）
SSHCMD="ssh -o StrictHostKeyChecking=no"

echo "1. 检查系统基本信息..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== 系统信息 ==="
uname -a
echo ""
echo "=== 运行时间 ==="
uptime
echo ""
EOF

echo "2. 检查 CPU 和内存使用..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== CPU 和内存 ==="
top -bn1 | head -20
echo ""
EOF

echo "3. 检查磁盘使用..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== 磁盘使用情况 ==="
df -h
echo ""
echo "=== inode 使用情况 ==="
df -i
echo ""
EOF

echo "4. 检查 Node.js 进程..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== Node.js 进程 ==="
ps aux | grep node | grep -v grep
echo ""
EOF

echo "5. 检查 PostgreSQL 状态..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== PostgreSQL 状态 ==="
sudo systemctl status postgresql || service postgresql status || echo "PostgreSQL 未安装或未运行"
echo ""
echo "=== PostgreSQL 进程 ==="
ps aux | grep postgres | grep -v grep | head -10
echo ""
EOF

echo "6. 检查端口监听..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== 监听端口 ==="
netstat -tlnp | grep -E ':(8080|9100|5432)' || ss -tlnp | grep -E ':(8080|9100|5432)'
echo ""
EOF

echo "7. 检查网络连接..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== TCP 连接统计 ==="
netstat -an | grep ESTABLISHED | wc -l
echo "当前建立的连接数"
echo ""
echo "=== 端口 9100 连接 ==="
netstat -an | grep ':9100' | grep ESTABLISHED | wc -l
echo "端口 9100 的连接数（CODESYS 设备）"
echo ""
EOF

echo "8. 检查云服务器目录..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== cloud-server 目录 ==="
if [ -d "/root/cloud-server" ]; then
    ls -la /root/cloud-server/
    echo ""
    echo "=== package.json ==="
    cat /root/cloud-server/package.json 2>/dev/null | head -20
elif [ -d "/home/cloud-server" ]; then
    ls -la /home/cloud-server/
else
    echo "未找到 cloud-server 目录"
    echo "搜索可能的位置..."
    find / -type d -name "cloud-server" 2>/dev/null | head -5
fi
echo ""
EOF

echo "9. 检查最近的日志..."
$SSHCMD ${USER}@${SERVER} << 'EOF'
echo "=== 系统日志（最近 20 行）==="
tail -20 /var/log/syslog 2>/dev/null || tail -20 /var/log/messages 2>/dev/null || echo "日志文件不可访问"
echo ""
EOF

echo ""
echo "======================================"
echo "状态检查完成"
echo "======================================"
