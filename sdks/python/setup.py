from setuptools import setup, find_packages

setup(
    name="agentsmail",
    version="2.0.0",
    description="Python SDK for AgentsMail — Email for AI Agents",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="AgentsMail",
    url="https://github.com/agentsmail/agentsmail",
    packages=find_packages(),
    install_requires=["requests>=2.20.0"],
    python_requires=">=3.7",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Topic :: Communications :: Email",
    ],
    keywords="email ai agents api agentsmail",
    license="MIT",
)
